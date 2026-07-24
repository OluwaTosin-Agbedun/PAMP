import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Prisma, Role } from "@/lib/generated/prisma/client";
import { AuthorisationError } from "@/lib/errors";
import { setSettingValue } from "@/lib/settings/service";
import { publishReviewFramework } from "@/modules/reviews/services/frameworkService";
import { createReview, submitReview } from "@/modules/reviews/services/reviewService";
import { recomputeReviewAverage } from "@/modules/scoring/services/scoreAggregationService";
import {
  autoAssignPanel,
  cancelPanelist,
  declareInterviewConflict,
  generateInterviewShortlist,
  reassignPanelist,
  scheduleInterview,
  setInterviewerCapacity,
} from "@/modules/interviews/services/panelAssignmentService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import {
  cleanupReviewFixtures,
  createTestApplication,
  createTestCriterion,
  createTestProgrammeAndCohort,
  createTestReviewAssignment,
  createTestStageAndDraftFramework,
} from "../helpers/reviewFixtures";

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

describe("Release 1 Module 1 — review score aggregation", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("averages R1/R2 when both are submitted and there's no escalation", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: r1 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r2 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpFixture(admin.id);
    try {
      const { application } = await createTestApplication(fixture.cohort.id);
      const a1 = await createTestReviewAssignment(application.id, r1.id, "FIRST");
      const a2 = await createTestReviewAssignment(application.id, r2.id, "SECOND");

      await submitScore(r1.id, a1.id, fixture.criterion.id, "80");
      await submitScore(r2.id, a2.id, fixture.criterion.id, "82");
      await recomputeReviewAverage(application.id);

      const score = await prisma.applicationScore.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(score.reviewAverage?.toString()).toBe("81");
      expect(score.reviewScoreCount).toBe(2);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("leaves reviewAverage null when fewer than 2 reviews are submitted", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: r1 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpFixture(admin.id);
    try {
      const { application } = await createTestApplication(fixture.cohort.id);
      const a1 = await createTestReviewAssignment(application.id, r1.id, "FIRST");
      await submitScore(r1.id, a1.id, fixture.criterion.id, "80");
      await recomputeReviewAverage(application.id);

      const score = await prisma.applicationScore.findUnique({ where: { applicationId: application.id } });
      expect(score?.reviewAverage ?? null).toBeNull();
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("uses ReviewEscalation.resolvedFinalScore verbatim once an escalation resolves", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: r1 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r2 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: r3 } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpFixture(admin.id);
    try {
      const { application } = await createTestApplication(fixture.cohort.id);
      const a1 = await createTestReviewAssignment(application.id, r1.id, "FIRST");
      const a2 = await createTestReviewAssignment(application.id, r2.id, "SECOND");

      // Wide divergence to guarantee escalation regardless of the configured threshold.
      await submitScore(r1.id, a1.id, fixture.criterion.id, "90");
      await submitScore(r2.id, a2.id, fixture.criterion.id, "20");

      const escalation = await prisma.reviewEscalation.findFirstOrThrow({ where: { applicationId: application.id } });
      const thirdAssignment = await prisma.reviewAssignment.findFirstOrThrow({
        where: { applicationId: application.id, slot: "THIRD" },
      });
      await submitScore(r3.id, thirdAssignment.id, fixture.criterion.id, "50");

      const resolved = await prisma.reviewEscalation.findUniqueOrThrow({ where: { id: escalation.id } });
      const score = await prisma.applicationScore.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(score.reviewAverage?.toString()).toBe(resolved.resolvedFinalScore?.toString());
      expect(score.reviewScoreCount).toBe(3);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });
});

describe("Release 1 Module 1 — Interview Assignment Engine", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("generateInterviewShortlist ranks by reviewAverage and respects the configured size", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: appHigh } = await createTestApplication(cohort.id);
      const { application: appMid } = await createTestApplication(cohort.id);
      const { application: appLow } = await createTestApplication(cohort.id);
      await prisma.applicationScore.create({ data: { applicationId: appHigh.id, cohortId: cohort.id, reviewAverage: new Prisma.Decimal(90), reviewScoreCount: 2 } });
      await prisma.applicationScore.create({ data: { applicationId: appMid.id, cohortId: cohort.id, reviewAverage: new Prisma.Decimal(70), reviewScoreCount: 2 } });
      await prisma.applicationScore.create({ data: { applicationId: appLow.id, cohortId: cohort.id, reviewAverage: new Prisma.Decimal(50), reviewScoreCount: 2 } });

      await setSettingValue("ranking.top70Size", 2, admin.id);
      const snapshot = await generateInterviewShortlist(admin.id, cohort.id);

      expect(snapshot.entries).toHaveLength(2);
      const sorted = [...snapshot.entries].sort((a, b) => a.rank - b.rank);
      expect(sorted[0].applicationId).toBe(appHigh.id);
      expect(sorted[1].applicationId).toBe(appMid.id);

      await setSettingValue("ranking.top70Size", 70, admin.id);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("autoAssignPanel picks the configured number of eligible interviewers with equal workload distribution", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const interviewers = await Promise.all(
        Array.from({ length: 5 }, () => createTestUser({ role: Role.INTERVIEWER })),
      );
      const { application } = await createTestApplication(cohort.id);
      const interview = await scheduleInterview(admin.id, cohort.id, {
        applicationId: application.id,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

      const result = await autoAssignPanel(interview.id);
      expect(result.assigned).toBe(true);
      expect(result.interviewerIds).toHaveLength(4);

      const panelists = await prisma.interviewPanelist.findMany({ where: { interviewId: interview.id, status: "ASSIGNED" } });
      expect(panelists).toHaveLength(4);
      expect(new Set(panelists.map((p) => p.userId)).size).toBe(4);
      void interviewers;
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("autoAssignPanel excludes an interviewer with a declared conflict of interest", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await Promise.all(Array.from({ length: 4 }, () => createTestUser({ role: Role.INTERVIEWER })));
      const { user: conflicted } = await createTestUser({ role: Role.INTERVIEWER });
      const { application } = await createTestApplication(cohort.id);

      await declareInterviewConflict(admin.id, {
        interviewerId: conflicted.id,
        applicationId: application.id,
        reason: "Family relation to applicant.",
      });

      const interview = await scheduleInterview(admin.id, cohort.id, {
        applicationId: application.id,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const result = await autoAssignPanel(interview.id);

      expect(result.assigned).toBe(true);
      expect(result.interviewerIds).not.toContain(conflicted.id);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("autoAssignPanel is idempotent — a second call on an already-assigned interview is a no-op", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await Promise.all(Array.from({ length: 4 }, () => createTestUser({ role: Role.INTERVIEWER })));
      const { application } = await createTestApplication(cohort.id);
      const interview = await scheduleInterview(admin.id, cohort.id, {
        applicationId: application.id,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

      await autoAssignPanel(interview.id);
      const second = await autoAssignPanel(interview.id);

      expect(second.assigned).toBe(false);
      const panelists = await prisma.interviewPanelist.findMany({ where: { interviewId: interview.id, status: "ASSIGNED" } });
      expect(panelists).toHaveLength(4);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("throws NoEligibleReviewersError when fewer than the configured panel size are eligible", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await createTestUser({ role: Role.INTERVIEWER }); // only 1 — fewer than the default panel size of 4
      const { application } = await createTestApplication(cohort.id);
      const interview = await scheduleInterview(admin.id, cohort.id, {
        applicationId: application.id,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

      const result = await autoAssignPanel(interview.id);
      expect(result.assigned).toBe(false);
      expect(result.interviewerIds).toEqual([]);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "INTERVIEW_PANEL_ASSIGNED", entityId: interview.id },
        orderBy: { createdAt: "desc" },
      });
      expect((audit?.metadata as { outcome: string })?.outcome).toBe("SKIPPED");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("reassignPanelist preserves history: the old seat moves to REASSIGNED, a new seat links back via reassignedFromId", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await Promise.all(Array.from({ length: 4 }, () => createTestUser({ role: Role.INTERVIEWER })));
      const { application } = await createTestApplication(cohort.id);
      const interview = await scheduleInterview(admin.id, cohort.id, {
        applicationId: application.id,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      await autoAssignPanel(interview.id);
      const [original] = await prisma.interviewPanelist.findMany({ where: { interviewId: interview.id, status: "ASSIGNED" } });

      // Created only now, after the auto-assign pass has already picked its
      // 4 panelists from the original pool — otherwise this account could
      // itself be one of the 4 selected (equal workload, arbitrary order),
      // making the reassignment-target assertions below flaky.
      const { user: replacement } = await createTestUser({ role: Role.INTERVIEWER });

      const newPanelist = await reassignPanelist(admin.id, {
        panelistId: original.id,
        newInterviewerId: replacement.id,
        reason: "Original panellist is unavailable that day.",
      });

      const oldRow = await prisma.interviewPanelist.findUniqueOrThrow({ where: { id: original.id } });
      expect(oldRow.status).toBe("REASSIGNED");
      expect(oldRow.userId).toBe(original.userId); // history preserved, never mutated
      expect(newPanelist.reassignedFromId).toBe(original.id);
      expect(newPanelist.userId).toBe(replacement.id);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("cancelPanelist transitions a seat to CANCELLED with a reason", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await Promise.all(Array.from({ length: 4 }, () => createTestUser({ role: Role.INTERVIEWER })));
      const { application } = await createTestApplication(cohort.id);
      const interview = await scheduleInterview(admin.id, cohort.id, {
        applicationId: application.id,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      await autoAssignPanel(interview.id);
      const [panelist] = await prisma.interviewPanelist.findMany({ where: { interviewId: interview.id, status: "ASSIGNED" } });

      await cancelPanelist(admin.id, panelist.id, "Interview cancelled.");

      const cancelled = await prisma.interviewPanelist.findUniqueOrThrow({ where: { id: panelist.id } });
      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.cancelReason).toBe("Interview cancelled.");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("setInterviewerCapacity excludes an at-capacity interviewer from auto-assignment", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await Promise.all(Array.from({ length: 4 }, () => createTestUser({ role: Role.INTERVIEWER })));
      const { user: atCapacity } = await createTestUser({ role: Role.INTERVIEWER });
      await setInterviewerCapacity(admin.id, {
        interviewerId: atCapacity.id,
        programmeId: programme.id,
        maxConcurrentInterviews: 0,
        isAvailable: true,
      });

      const { application } = await createTestApplication(cohort.id);
      const interview = await scheduleInterview(admin.id, cohort.id, {
        applicationId: application.id,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const result = await autoAssignPanel(interview.id);

      expect(result.assigned).toBe(true);
      expect(result.interviewerIds).not.toContain(atCapacity.id);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("denies interview_assignments.manage to an Interviewer (not the Secretariat/Admin roles that hold it)", async () => {
    const { user: interviewer } = await createTestUser({ role: Role.INTERVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      await expect(
        scheduleInterview(interviewer.id, cohort.id, {
          applicationId: application.id,
          scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("an Interviewer may declare their own conflict; cannot record one for someone else", async () => {
    const { user: interviewer } = await createTestUser({ role: Role.INTERVIEWER });
    const { user: otherInterviewer } = await createTestUser({ role: Role.INTERVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);

      const own = await declareInterviewConflict(interviewer.id, {
        interviewerId: interviewer.id,
        applicationId: application.id,
        reason: "I know this applicant personally.",
      });
      expect(own.source).toBe("SELF_DECLARED");

      await expect(
        declareInterviewConflict(interviewer.id, {
          interviewerId: otherInterviewer.id,
          applicationId: application.id,
          reason: "Trying to declare on someone else's behalf.",
        }),
      ).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
