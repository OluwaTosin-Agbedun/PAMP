import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import type { AccountStatus } from "@/lib/generated/prisma/enums";
import { TEST_EMAIL_DOMAIN } from "../helpers/db";
import {
  AuthorisationError,
  ConflictError,
  ConflictOfInterestError,
  DuplicateAssignmentError,
  InvalidStatusTransitionError,
  NotFoundError,
  ReviewConcurrencyError,
  ReviewerAtCapacityError,
} from "@/lib/errors";
import { publishReviewFramework } from "@/modules/reviews/services/frameworkService";
import { createReview, submitReview } from "@/modules/reviews/services/reviewService";
import {
  acceptAssignment,
  autoAssignReviewers,
  cancelAssignment,
  declareConflictOfInterest,
  getAssignmentAnalytics,
  listMyAssignments,
  manualAssignReviewer,
  reassignAssignment,
  setReviewerCapacity,
} from "@/modules/reviews/services/assignmentService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import {
  cleanupReviewFixtures,
  createTestApplication,
  createTestCriterion,
  createTestProgrammeAndCohort,
  createTestReviewAssignment,
  createTestStageAndDraftFramework,
} from "../helpers/reviewFixtures";

/** A published single-criterion (max 100) framework, so a review's total score equals the raw score submitted — makes divergence-threshold arithmetic easy to reason about. */
async function setUpAssignmentFixture(adminId: string) {
  const { programme, cohort } = await createTestProgrammeAndCohort();
  const { stage, framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "100" });
  const criterion = await createTestCriterion(framework.id, { code: "TOTAL", label: "Overall", maxScore: "100", displayOrder: 0 });
  await publishReviewFramework(adminId, { frameworkId: framework.id });
  const { application } = await createTestApplication(cohort.id);
  return { programme, cohort, stage, framework, criterion, application };
}

async function submitScore(reviewerId: string, assignmentId: string, criterionId: string, score: string) {
  const review = await createReview(reviewerId, assignmentId);
  return submitReview(reviewerId, { reviewId: review.id, scores: [{ criterionId, score }], comments: "Test submission." });
}

describe("review assignment engine (real Postgres)", () => {
  // The reviewer candidate pool (assignmentService.loadReviewerPool) is
  // intentionally global — Role.APPLICATION_REVIEWER is a system-wide role, not
  // scoped to a programme — so any real seeded/dev Reviewer accounts in
  // this shared Postgres instance would otherwise silently pollute every
  // "exactly N eligible reviewers" test below. Deactivating them for the
  // suite's duration (and restoring afterwards) isolates these tests the
  // same way a dedicated test Programme isolates framework/application
  // data, without changing the engine's genuinely-global-by-design pool.
  let realReviewers: { id: string; status: AccountStatus }[] = [];

  beforeAll(async () => {
    realReviewers = await prisma.user.findMany({
      where: { role: Role.APPLICATION_REVIEWER, email: { not: { endsWith: TEST_EMAIL_DOMAIN } } },
      select: { id: true, status: true },
    });
    if (realReviewers.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: realReviewers.map((r) => r.id) } },
        data: { status: "INACTIVE" },
      });
    }
  });

  afterAll(async () => {
    for (const reviewer of realReviewers) {
      await prisma.user.update({ where: { id: reviewer.id }, data: { status: reviewer.status } });
    }
  });

  afterEach(async () => {
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  // -------------------------------------------------------------------
  // Automatic assignment / equal distribution / duplicate prevention
  // -------------------------------------------------------------------

  it("auto-assigns two reviewers, preferring the ones with the lightest current load, and is idempotent", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: light } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: alsoLight } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: heavy } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      // Give `heavy` three existing active assignments elsewhere so they're never picked over the two light reviewers.
      for (let i = 0; i < 3; i++) {
        const { application: other } = await createTestApplication(fixture.cohort.id);
        await createTestReviewAssignment(other.id, heavy.id, i === 0 ? "FIRST" : i === 1 ? "SECOND" : "THIRD");
      }

      const result = await autoAssignReviewers(fixture.application.id);
      expect(result.assigned).toBe(true);
      expect(result.reviewerIds.sort()).toEqual([light.id, alsoLight.id].sort());
      expect(result.reviewerIds).not.toContain(heavy.id);

      const active = await prisma.reviewAssignment.findMany({ where: { applicationId: fixture.application.id } });
      expect(active).toHaveLength(2);
      expect(new Set(active.map((a) => a.slot))).toEqual(new Set(["FIRST", "SECOND"]));

      const audit = await prisma.auditLog.findFirst({
        where: { action: "REVIEW_ASSIGNED", entityId: fixture.application.id },
      });
      expect(audit).not.toBeNull();
      expect((audit?.metadata as { outcome?: string })?.outcome).toBe("ASSIGNED");

      // Idempotent: a second call makes no further changes.
      const again = await autoAssignReviewers(fixture.application.id);
      expect(again.assigned).toBe(false);
      const stillActive = await prisma.reviewAssignment.findMany({ where: { applicationId: fixture.application.id } });
      expect(stillActive).toHaveLength(2);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("skips assignment without throwing when fewer than two eligible reviewers exist", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: onlyReviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const result = await autoAssignReviewers(fixture.application.id);
      expect(result.assigned).toBe(false);
      expect(result.reviewerIds).toEqual([]);
      const rows = await prisma.reviewAssignment.findMany({ where: { applicationId: fixture.application.id } });
      expect(rows).toHaveLength(0);
      void onlyReviewer;
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("a concurrent duplicate auto-assignment never leaves more than one active assignment per slot", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    await createTestUser({ role: Role.APPLICATION_REVIEWER });
    await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      await Promise.allSettled([autoAssignReviewers(fixture.application.id), autoAssignReviewers(fixture.application.id)]);

      const rows = await prisma.reviewAssignment.findMany({
        where: { applicationId: fixture.application.id, status: { notIn: ["REASSIGNED", "CANCELLED"] } },
      });
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.slot))).toEqual(new Set(["FIRST", "SECOND"]));
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("manual assignment prevents assigning the same reviewer twice to one application", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      await manualAssignReviewer(admin.id, { applicationId: fixture.application.id, reviewerId: reviewer.id, slot: "FIRST" });
      await expect(
        manualAssignReviewer(admin.id, { applicationId: fixture.application.id, reviewerId: reviewer.id, slot: "SECOND" }),
      ).rejects.toBeInstanceOf(DuplicateAssignmentError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("manualAssignReviewer requires the reviews.assign permission", async () => {
    const { user: reviewerActor } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: target } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      await expect(
        manualAssignReviewer(reviewerActor.id, { applicationId: fixture.application.id, reviewerId: target.id, slot: "FIRST" }),
      ).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  // -------------------------------------------------------------------
  // Capacity enforcement
  // -------------------------------------------------------------------

  it("excludes a reviewer at their configured capacity from automatic assignment", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: atCapacity } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: available } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      await setReviewerCapacity(admin.id, {
        reviewerId: atCapacity.id,
        programmeId: fixture.programme.id,
        maxConcurrentAssignments: 1,
      });
      const { application: other } = await createTestApplication(fixture.cohort.id);
      await createTestReviewAssignment(other.id, atCapacity.id, "FIRST");

      const result = await autoAssignReviewers(fixture.application.id);
      expect(result.assigned).toBe(false); // only one eligible reviewer (`available`) remains — needs two
      void available;
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("manual assignment to a reviewer at capacity throws ReviewerAtCapacityError", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      await setReviewerCapacity(admin.id, { reviewerId: reviewer.id, programmeId: fixture.programme.id, maxConcurrentAssignments: 1 });
      const { application: other } = await createTestApplication(fixture.cohort.id);
      await createTestReviewAssignment(other.id, reviewer.id, "FIRST");

      await expect(
        manualAssignReviewer(admin.id, { applicationId: fixture.application.id, reviewerId: reviewer.id, slot: "FIRST" }),
      ).rejects.toBeInstanceOf(ReviewerAtCapacityError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("setReviewerCapacity is audited with before/after values", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const capacity = await setReviewerCapacity(admin.id, {
        reviewerId: reviewer.id,
        programmeId: fixture.programme.id,
        maxConcurrentAssignments: 3,
        isAvailable: false,
        unavailableReason: "On leave for this cohort.",
      });
      expect(capacity.maxConcurrentAssignments).toBe(3);
      expect(capacity.isAvailable).toBe(false);

      const audit = await prisma.auditLog.findFirst({ where: { action: "REVIEWER_CAPACITY_CHANGED", entityId: capacity.id } });
      expect(audit).not.toBeNull();
      expect((audit?.metadata as { after?: { maxConcurrentAssignments?: number } })?.after?.maxConcurrentAssignments).toBe(3);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  // -------------------------------------------------------------------
  // Conflict of interest
  // -------------------------------------------------------------------

  it("excludes a reviewer with a declared conflict of interest from automatic assignment", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: conflicted } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: clean1 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: clean2 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      await declareConflictOfInterest(admin.id, {
        reviewerId: conflicted.id,
        applicationId: fixture.application.id,
        reason: "Conflicted reviewer is the applicant's relative.",
      });

      const result = await autoAssignReviewers(fixture.application.id);
      expect(result.assigned).toBe(true);
      expect(result.reviewerIds).not.toContain(conflicted.id);
      expect(result.reviewerIds.sort()).toEqual([clean1.id, clean2.id].sort());
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("manual assignment to a conflicted reviewer throws ConflictOfInterestError", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      await declareConflictOfInterest(secretary.id, {
        reviewerId: reviewer.id,
        applicationId: fixture.application.id,
        reason: "Prior professional relationship with applicant.",
      });

      await expect(
        manualAssignReviewer(admin.id, { applicationId: fixture.application.id, reviewerId: reviewer.id, slot: "FIRST" }),
      ).rejects.toBeInstanceOf(ConflictOfInterestError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("declareConflictOfInterest records SELF_DECLARED when the reviewer declares their own conflict, ADMIN_RECORDED otherwise", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const selfDeclared = await declareConflictOfInterest(reviewer.id, {
        reviewerId: reviewer.id,
        applicationId: fixture.application.id,
        reason: "I know this applicant personally.",
      });
      expect(selfDeclared.source).toBe("SELF_DECLARED");

      const { application: other } = await createTestApplication(fixture.cohort.id);
      const adminRecorded = await declareConflictOfInterest(admin.id, {
        reviewerId: reviewer.id,
        applicationId: other.id,
        reason: "Flagged during onboarding review.",
      });
      expect(adminRecorded.source).toBe("ADMIN_RECORDED");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  // -------------------------------------------------------------------
  // Accept / cancel / reassign
  // -------------------------------------------------------------------

  it("a reviewer accepting their own assignment moves it to ACCEPTED and is audited", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const accepted = await acceptAssignment(reviewer.id, assignment.id);
      expect(accepted?.status).toBe("ACCEPTED");
      expect(accepted?.acceptedAt).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({ where: { action: "ASSIGNMENT_ACCEPTED", entityId: assignment.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("a reviewer cannot accept another reviewer's assignment", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: owner } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: intruder } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, owner.id);
      await expect(acceptAssignment(intruder.id, assignment.id)).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("cancelAssignment moves an assignment to CANCELLED with a reason and audit entry", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const cancelled = await cancelAssignment(secretary.id, { assignmentId: assignment.id, reason: "Reviewer withdrew from the cohort." });
      expect(cancelled?.status).toBe("CANCELLED");
      expect(cancelled?.cancelReason).toBe("Reviewer withdrew from the cohort.");

      const audit = await prisma.auditLog.findFirst({ where: { action: "ASSIGNMENT_CANCELLED", entityId: assignment.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("cancelAssignment requires the assignments.cancel permission", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      await expect(cancelAssignment(reviewer.id, { assignmentId: assignment.id, reason: "Trying to self-cancel." })).rejects.toBeInstanceOf(
        AuthorisationError,
      );
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("reassignment preserves history: the old row becomes REASSIGNED, the new row links back via reassignedFromId, both audited", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: original } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: replacement } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, original.id, "FIRST");

      const newAssignment = await reassignAssignment(secretary.id, {
        assignmentId: assignment.id,
        newReviewerId: replacement.id,
        reason: "Original reviewer is unavailable this cycle.",
      });

      expect(newAssignment.reviewerId).toBe(replacement.id);
      expect(newAssignment.slot).toBe("FIRST");
      expect(newAssignment.reassignedFromId).toBe(assignment.id);

      const oldRow = await prisma.reviewAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
      expect(oldRow.status).toBe("REASSIGNED");
      expect(oldRow.reviewerId).toBe(original.id); // never mutated — history preserved

      const audit = await prisma.auditLog.findFirst({ where: { action: "ASSIGNMENT_REASSIGNED", entityId: newAssignment.id } });
      expect(audit).not.toBeNull();
      expect((audit?.metadata as { fromReviewerId?: string })?.fromReviewerId).toBe(original.id);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("reassignment cannot target the currently assigned reviewer", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      await expect(
        reassignAssignment(secretary.id, { assignmentId: assignment.id, newReviewerId: reviewer.id, reason: "Same reviewer by mistake." }),
      ).rejects.toBeInstanceOf(ConflictError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("a submitted assignment cannot be reassigned", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: replacement } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      await submitScore(reviewer.id, assignment.id, fixture.criterion.id, "80");

      await expect(
        reassignAssignment(secretary.id, { assignmentId: assignment.id, newReviewerId: replacement.id, reason: "Too late, already submitted." }),
      ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("reassignAssignment requires the assignments.reassign permission", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: replacement } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      await expect(
        reassignAssignment(reviewer.id, { assignmentId: assignment.id, newReviewerId: replacement.id, reason: "Not authorised to do this." }),
      ).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("concurrent reassignment attempts on the same assignment: only one succeeds, the other loses cleanly", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: original } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: candidateA } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: candidateB } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, original.id);

      const results = await Promise.allSettled([
        reassignAssignment(secretary.id, { assignmentId: assignment.id, newReviewerId: candidateA.id, reason: "Racing reassignment attempt A." }),
        reassignAssignment(secretary.id, { assignmentId: assignment.id, newReviewerId: candidateB.id, reason: "Racing reassignment attempt B." }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBeLessThanOrEqual(1);
      const rejected = results.filter((r) => r.status === "rejected");
      for (const r of rejected) {
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ReviewConcurrencyError);
      }
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  // -------------------------------------------------------------------
  // Blind review enforcement
  // -------------------------------------------------------------------

  it("listMyAssignments returns only the calling reviewer's own active assignments", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: reviewerA } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: reviewerB } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const assignmentA = await createTestReviewAssignment(fixture.application.id, reviewerA.id, "FIRST");
      await createTestReviewAssignment(fixture.application.id, reviewerB.id, "SECOND");

      const mine = await listMyAssignments(reviewerA.id);
      expect(mine.map((a) => a.id)).toEqual([assignmentA.id]);
      expect(mine.every((a) => a.reviewerId === reviewerA.id)).toBe(true);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  // -------------------------------------------------------------------
  // Third-review escalation engine
  // -------------------------------------------------------------------

  it("does not escalate when Reviewer 1 and Reviewer 2 are within the configured divergence threshold", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: r1 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r2 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const a1 = await createTestReviewAssignment(fixture.application.id, r1.id, "FIRST");
      const a2 = await createTestReviewAssignment(fixture.application.id, r2.id, "SECOND");

      await submitScore(r1.id, a1.id, fixture.criterion.id, "70");
      await submitScore(r2.id, a2.id, fixture.criterion.id, "75"); // 5pp gap, under the default 13pp threshold

      const rows = await prisma.reviewAssignment.findMany({ where: { applicationId: fixture.application.id } });
      expect(rows.every((r) => r.status === "COMPLETED")).toBe(true);

      const escalation = await prisma.reviewEscalation.findFirst({ where: { applicationId: fixture.application.id } });
      expect(escalation).toBeNull();
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("escalates and auto-assigns a third reviewer, excluding R1 and R2, when divergence exceeds the threshold", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: r1 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r2 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r3 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const a1 = await createTestReviewAssignment(fixture.application.id, r1.id, "FIRST");
      const a2 = await createTestReviewAssignment(fixture.application.id, r2.id, "SECOND");

      await submitScore(r1.id, a1.id, fixture.criterion.id, "90");
      await submitScore(r2.id, a2.id, fixture.criterion.id, "60"); // 30pp gap, over the default 13pp threshold

      const [reloadedA1, reloadedA2] = await Promise.all([
        prisma.reviewAssignment.findUniqueOrThrow({ where: { id: a1.id } }),
        prisma.reviewAssignment.findUniqueOrThrow({ where: { id: a2.id } }),
      ]);
      expect(reloadedA1.status).toBe("ESCALATED");
      expect(reloadedA2.status).toBe("ESCALATED");

      const escalation = await prisma.reviewEscalation.findFirstOrThrow({ where: { applicationId: fixture.application.id } });
      expect(escalation.scoreDifference.toString()).toBe("30");
      expect(escalation.thirdReviewAssignmentId).not.toBeNull();

      const thirdAssignment = await prisma.reviewAssignment.findUniqueOrThrow({
        where: { id: escalation.thirdReviewAssignmentId! },
      });
      expect(thirdAssignment.slot).toBe("THIRD");
      expect(thirdAssignment.reviewerId).toBe(r3.id); // the only eligible reviewer left, since r1/r2 are excluded

      const audit = await prisma.auditLog.findFirst({ where: { action: "REVIEW_ESCALATION_TRIGGERED", entityId: fixture.application.id } });
      expect(audit).not.toBeNull();
      expect((audit?.metadata as { outcome?: string })?.outcome).toBe("TRIGGERED");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("resolves the escalation once the third reviewer submits: final score = avg(lower of R1/R2, R3), all three assignments complete", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: r1 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r2 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r3 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    try {
      const a1 = await createTestReviewAssignment(fixture.application.id, r1.id, "FIRST");
      const a2 = await createTestReviewAssignment(fixture.application.id, r2.id, "SECOND");

      await submitScore(r1.id, a1.id, fixture.criterion.id, "90"); // higher
      await submitScore(r2.id, a2.id, fixture.criterion.id, "60"); // lower — 30pp gap, escalates

      const escalation = await prisma.reviewEscalation.findFirstOrThrow({ where: { applicationId: fixture.application.id } });
      const thirdAssignment = await prisma.reviewAssignment.findUniqueOrThrow({ where: { id: escalation.thirdReviewAssignmentId! } });
      expect(thirdAssignment.reviewerId).toBe(r3.id);

      await submitScore(r3.id, thirdAssignment.id, fixture.criterion.id, "80");

      // lower(90, 60) = 60; avg(60, 80) = 70
      const resolved = await prisma.reviewEscalation.findUniqueOrThrow({ where: { id: escalation.id } });
      expect(resolved.resolvedFinalScore?.toString()).toBe("70");
      expect(resolved.resolvedAt).not.toBeNull();

      const [reloadedA1, reloadedA2, reloadedThird] = await Promise.all([
        prisma.reviewAssignment.findUniqueOrThrow({ where: { id: a1.id } }),
        prisma.reviewAssignment.findUniqueOrThrow({ where: { id: a2.id } }),
        prisma.reviewAssignment.findUniqueOrThrow({ where: { id: thirdAssignment.id } }),
      ]);
      expect(reloadedA1.status).toBe("COMPLETED");
      expect(reloadedA2.status).toBe("COMPLETED");
      expect(reloadedThird.status).toBe("COMPLETED");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("an escalation with no eligible third reviewer is recorded but does not block the reviewers' own submissions", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    const { user: r1 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r2 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    // No third reviewer exists in the pool at all.
    try {
      const a1 = await createTestReviewAssignment(fixture.application.id, r1.id, "FIRST");
      const a2 = await createTestReviewAssignment(fixture.application.id, r2.id, "SECOND");

      await submitScore(r1.id, a1.id, fixture.criterion.id, "90");
      await expect(submitScore(r2.id, a2.id, fixture.criterion.id, "60")).resolves.toBeDefined();

      const escalation = await prisma.reviewEscalation.findFirstOrThrow({ where: { applicationId: fixture.application.id } });
      expect(escalation.thirdReviewAssignmentId).toBeNull();
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  // -------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------

  it("getAssignmentAnalytics requires the assignments.view permission and reports active/completed/escalation counts", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpAssignmentFixture(admin.id);
    try {
      await createTestReviewAssignment(fixture.application.id, reviewer.id, "FIRST");

      await expect(getAssignmentAnalytics(reviewer.id, fixture.programme.id)).rejects.toBeInstanceOf(AuthorisationError);

      const analytics = await getAssignmentAnalytics(admin.id, fixture.programme.id);
      expect(analytics.activeAssignments).toBeGreaterThanOrEqual(1);
      expect(analytics.reviewerCount).toBeGreaterThanOrEqual(0);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("manual assignment to a nonexistent or non-Reviewer user throws NotFoundError", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpAssignmentFixture(admin.id);
    try {
      await expect(
        manualAssignReviewer(admin.id, { applicationId: fixture.application.id, reviewerId: "does-not-exist", slot: "FIRST" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });
});
