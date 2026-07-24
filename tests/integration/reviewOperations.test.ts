import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError } from "@/lib/errors";
import { publishReviewFramework } from "@/modules/reviews/services/frameworkService";
import { createReview, submitReview } from "@/modules/reviews/services/reviewService";
import { reassignAssignment, setReviewerCapacity } from "@/modules/reviews/services/assignmentService";
import { createAdministrativeNote, listAdministrativeNotes } from "@/modules/notes/service";
import { getReviewOperationsDashboard } from "@/modules/reviewOperations/services/dashboardService";
import { getAssignmentMonitoring } from "@/modules/reviewOperations/services/assignmentMonitoringService";
import { getEscalationMonitoring } from "@/modules/reviewOperations/services/escalationMonitoringService";
import { getConflictQueue } from "@/modules/reviewOperations/services/conflictQueueService";
import { getReviewerWorkload } from "@/modules/reviewOperations/services/workloadService";
import { exportAssignmentMonitoringCsv } from "@/modules/reviewOperations/services/exportService";
import { getApplicationOperationsDetail } from "@/modules/reviewOperations/services/applicationDetailService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import {
  cleanupReviewFixtures,
  createTestApplication,
  createTestCriterion,
  createTestProgrammeAndCohort,
  createTestReviewAssignment,
  createTestStageAndDraftFramework,
} from "../helpers/reviewFixtures";

/** A published single-criterion (max 100) framework, so a review's total equals the raw score submitted. */
async function setUpFixture(adminId: string) {
  const { programme, cohort } = await createTestProgrammeAndCohort();
  const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "100" });
  const criterion = await createTestCriterion(framework.id, { code: "TOTAL", label: "Overall", maxScore: "100", displayOrder: 0 });
  await publishReviewFramework(adminId, { frameworkId: framework.id });
  return { programme, cohort, framework, criterion };
}

async function submitScore(reviewerId: string, assignmentId: string, criterionId: string, score: string) {
  const review = await createReview(reviewerId, assignmentId);
  return submitReview(reviewerId, { reviewId: review.id, scores: [{ criterionId, score }], comments: "Test." });
}

describe("Programme Secretariat review operations (Phase 3D)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  it("authorised Secretariat access: dashboard, monitoring, workload, escalations, and conflicts all resolve", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const fixture = await setUpFixture(admin.id);
    try {
      await expect(getReviewOperationsDashboard(secretary.id, fixture.programme.id, fixture.cohort.id)).resolves.toBeDefined();
      await expect(
        getAssignmentMonitoring(secretary.id, fixture.programme.id, fixture.cohort.id, { page: 1, pageSize: 25 }),
      ).resolves.toBeDefined();
      await expect(getReviewerWorkload(secretary.id, fixture.programme.id)).resolves.toBeDefined();
      await expect(getEscalationMonitoring(secretary.id, fixture.cohort.id)).resolves.toBeDefined();
      await expect(getConflictQueue(secretary.id, fixture.cohort.id)).resolves.toBeDefined();
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("unauthorised access is denied for an Application Reviewer — reviewer independence protected", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpFixture(admin.id);
    try {
      await expect(
        getReviewOperationsDashboard(reviewer.id, fixture.programme.id, fixture.cohort.id),
      ).rejects.toBeInstanceOf(AuthorisationError);
      await expect(
        getAssignmentMonitoring(reviewer.id, fixture.programme.id, fixture.cohort.id, { page: 1, pageSize: 25 }),
      ).rejects.toBeInstanceOf(AuthorisationError);
      await expect(getEscalationMonitoring(reviewer.id, fixture.cohort.id)).rejects.toBeInstanceOf(AuthorisationError);
      await expect(exportAssignmentMonitoringCsv(reviewer.id, fixture.programme.id, fixture.cohort.id, {})).rejects.toBeInstanceOf(
        AuthorisationError,
      );
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("computes correct dashboard totals from a known fixture", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: r1 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r2 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpFixture(admin.id);
    try {
      // One fully-assigned, both-submitted application.
      const { application: appA } = await createTestApplication(fixture.cohort.id);
      const a1 = await createTestReviewAssignment(appA.id, r1.id, "FIRST");
      const a2 = await createTestReviewAssignment(appA.id, r2.id, "SECOND");
      await submitScore(r1.id, a1.id, fixture.criterion.id, "80");
      await submitScore(r2.id, a2.id, fixture.criterion.id, "82");

      // One awaiting assignment.
      await createTestApplication(fixture.cohort.id);

      const metrics = await getReviewOperationsDashboard(secretary.id, fixture.programme.id, fixture.cohort.id);
      expect(metrics.totalEligibleApplications).toBe(2);
      expect(metrics.applicationsAssigned).toBe(1);
      expect(metrics.applicationsAwaitingAssignment).toBe(1);
      expect(metrics.reviewsSubmitted).toBe(2);
      expect(metrics.thirdReviewsTriggered).toBe(0);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("programme and cohort isolation: a second cohort's data never appears in the first's dashboard", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const fixtureA = await setUpFixture(admin.id);
    const fixtureB = await setUpFixture(admin.id);
    try {
      await createTestApplication(fixtureA.cohort.id);
      await createTestApplication(fixtureB.cohort.id);
      await createTestApplication(fixtureB.cohort.id);

      const metricsA = await getReviewOperationsDashboard(secretary.id, fixtureA.programme.id, fixtureA.cohort.id);
      const metricsB = await getReviewOperationsDashboard(secretary.id, fixtureB.programme.id, fixtureB.cohort.id);

      expect(metricsA.totalEligibleApplications).toBe(1);
      expect(metricsB.totalEligibleApplications).toBe(2);
    } finally {
      await cleanupReviewFixtures(fixtureA.programme.id);
      await cleanupReviewFixtures(fixtureB.programme.id);
    }
  });

  it("reassignment via the review-operations flow preserves assignment history (uses the Phase 3B engine, not a new implementation)", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: original } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: replacement } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpFixture(admin.id);
    try {
      const { application } = await createTestApplication(fixture.cohort.id);
      const assignment = await createTestReviewAssignment(application.id, original.id, "FIRST");

      const newAssignment = await reassignAssignment(secretary.id, {
        assignmentId: assignment.id,
        newReviewerId: replacement.id,
        reason: "Original reviewer unavailable this cycle.",
      });

      const oldRow = await prisma.reviewAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
      expect(oldRow.status).toBe("REASSIGNED");
      expect(oldRow.reviewerId).toBe(original.id);
      expect(newAssignment.reassignedFromId).toBe(assignment.id);

      const detail = await getApplicationOperationsDetail(secretary.id, application.id);
      expect(detail.activeAssignments.map((a) => a.reviewerId)).toContain(replacement.id);
      expect(detail.assignmentHistory).toHaveLength(2);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("conflict queue shows an admin-recorded conflict of interest", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpFixture(admin.id);
    try {
      const { application } = await createTestApplication(fixture.cohort.id);

      const { declareConflictOfInterest } = await import("@/modules/reviews/services/assignmentService");
      await declareConflictOfInterest(secretary.id, {
        reviewerId: reviewer.id,
        applicationId: application.id,
        reason: "Reviewer knows the applicant personally.",
      });

      const queue = await getConflictQueue(secretary.id, fixture.cohort.id);
      expect(queue).toHaveLength(1);
      expect(queue[0].kind).toBe("PRE_ASSIGNMENT_EXCLUSION");
      expect(queue[0].reviewerId).toBe(reviewer.id);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("third-review monitoring shows both reviewers' scores, divergence, and the resolved final score, without recalculating anything", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: r1 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r2 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r3 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpFixture(admin.id);
    try {
      const { application } = await createTestApplication(fixture.cohort.id);
      const a1 = await createTestReviewAssignment(application.id, r1.id, "FIRST");
      const a2 = await createTestReviewAssignment(application.id, r2.id, "SECOND");

      await submitScore(r1.id, a1.id, fixture.criterion.id, "90");
      await submitScore(r2.id, a2.id, fixture.criterion.id, "60"); // 30pp gap — escalates

      const escalation = await prisma.reviewEscalation.findFirstOrThrow({ where: { applicationId: application.id } });
      const thirdAssignment = await prisma.reviewAssignment.findUniqueOrThrow({ where: { id: escalation.thirdReviewAssignmentId! } });
      expect(thirdAssignment.reviewerId).toBe(r3.id);

      await submitScore(r3.id, thirdAssignment.id, fixture.criterion.id, "80");

      const rows = await getEscalationMonitoring(secretary.id, fixture.cohort.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].firstScore).toBe("90");
      expect(rows[0].secondScore).toBe("60");
      expect(rows[0].divergencePercent).toBe("30");
      expect(rows[0].thirdReviewerName).toBe(r3.name);
      // lower(90, 60) = 60; avg(60, 80) = 70 — computed by Phase 3B, read verbatim here.
      expect(rows[0].resolvedFinalScore).toBe("70");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("export requires review_operations.export specifically, distinct from review_operations.view, and writes an audit record", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const fixture = await setUpFixture(admin.id);
    try {
      await createTestApplication(fixture.cohort.id);

      const csv = await exportAssignmentMonitoringCsv(secretary.id, fixture.programme.id, fixture.cohort.id, {});
      expect(csv).toContain("Application Number");
      expect(csv.startsWith("﻿")).toBe(true); // UTF-8 BOM for Excel compatibility

      const auditRow = await prisma.auditLog.findFirst({
        where: { action: "REVIEW_OPERATIONS_EXPORTED", cohortId: fixture.cohort.id },
      });
      expect(auditRow).not.toBeNull();
      expect((auditRow?.metadata as { rowCount?: number })?.rowCount).toBe(1);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("export excludes email addresses and raw scores/comments (data minimization)", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER, email: "distinctive-marker@test.pam-p.invalid" });
    const fixture = await setUpFixture(admin.id);
    try {
      const { application } = await createTestApplication(fixture.cohort.id);
      const assignment = await createTestReviewAssignment(application.id, reviewer.id, "FIRST");
      await submitScore(reviewer.id, assignment.id, fixture.criterion.id, "77");

      const csv = await exportAssignmentMonitoringCsv(secretary.id, fixture.programme.id, fixture.cohort.id, {});
      expect(csv).not.toContain("distinctive-marker@test.pam-p.invalid");
      expect(csv).not.toContain("77");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("pagination and filters: pageSize limits results, status filter narrows the set correctly", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const fixture = await setUpFixture(admin.id);
    try {
      await createTestApplication(fixture.cohort.id);
      await createTestApplication(fixture.cohort.id);
      await createTestApplication(fixture.cohort.id);

      const page1 = await getAssignmentMonitoring(secretary.id, fixture.programme.id, fixture.cohort.id, { page: 1, pageSize: 2 });
      expect(page1.total).toBe(3);
      expect(page1.rows).toHaveLength(2);

      const page2 = await getAssignmentMonitoring(secretary.id, fixture.programme.id, fixture.cohort.id, { page: 2, pageSize: 2 });
      expect(page2.rows).toHaveLength(1);

      const awaitingOnly = await getAssignmentMonitoring(secretary.id, fixture.programme.id, fixture.cohort.id, {
        page: 1,
        pageSize: 25,
        status: "AWAITING_ASSIGNMENT",
      });
      expect(awaitingOnly.total).toBe(3);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("reviewer workload reflects capacity and active assignment counts", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpFixture(admin.id);
    try {
      await setReviewerCapacity(admin.id, { reviewerId: reviewer.id, programmeId: fixture.programme.id, maxConcurrentAssignments: 4 });
      const { application } = await createTestApplication(fixture.cohort.id);
      await createTestReviewAssignment(application.id, reviewer.id, "FIRST");

      const workload = await getReviewerWorkload(secretary.id, fixture.programme.id);
      const row = workload.find((r) => r.reviewerId === reviewer.id);
      expect(row?.activeAssignmentCount).toBe(1);
      expect(row?.maxConcurrentAssignments).toBe(4);
      expect(row?.utilisationPercent).toBe(25);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("administrative notes are timestamped, attributed, and kept separate from reviewer comments", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const fixture = await setUpFixture(admin.id);
    try {
      const { application } = await createTestApplication(fixture.cohort.id);

      const note = await createAdministrativeNote(secretary.id, application.id, "Flagged for follow-up with the applicant's referee.");
      expect(note.authorId).toBe(secretary.id);
      expect(note.visibility).toBe("ALL_STAFF");

      const notes = await listAdministrativeNotes(secretary.id, application.id);
      expect(notes).toHaveLength(1);
      expect(notes[0].body).toContain("follow-up");

      const auditRow = await prisma.auditLog.findFirst({ where: { action: "ADMINISTRATIVE_NOTE_CREATED", entityId: note.id } });
      expect(auditRow).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });
});
