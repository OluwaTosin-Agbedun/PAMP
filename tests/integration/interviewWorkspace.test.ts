import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import {
  AuthorisationError,
  IncompleteReviewError,
  InsufficientSubmissionsError,
  InterviewScoringClosedError,
  ReviewAlreadySubmittedError,
  ReviewPeriodClosedError,
} from "@/lib/errors";
import { autoAssignPanel, scheduleInterview } from "@/modules/interviews/services/panelAssignmentService";
import {
  closeInterviewWithOverride,
  getInterviewScoreOverviewForSecretariat,
  getInterviewWorkspaceView,
  getOrCreateInterviewScore,
  saveDraftInterviewScores,
  submitInterviewScore,
} from "@/modules/interviews/services/interviewScoreService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import {
  cleanupReviewFixtures,
  createTestApplication,
  createTestInterviewCriterion,
  createTestProgrammeAndCohort,
} from "../helpers/reviewFixtures";

async function setUpInterview(adminId: string) {
  const { programme, cohort } = await createTestProgrammeAndCohort();
  const criterionA = await createTestInterviewCriterion(cohort.id, { label: "Question A", maxScore: "10", weight: "1", order: 0 });
  const criterionB = await createTestInterviewCriterion(cohort.id, { label: "Question B", maxScore: "10", weight: "2", order: 1 });
  await Promise.all(Array.from({ length: 4 }, () => createTestUser({ role: Role.INTERVIEWER })));
  const { application } = await createTestApplication(cohort.id);
  const interview = await scheduleInterview(adminId, cohort.id, {
    applicationId: application.id,
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await autoAssignPanel(interview.id);
  const panelists = await prisma.interviewPanelist.findMany({ where: { interviewId: interview.id, status: "ASSIGNED" } });
  return { programme, cohort, criterionA, criterionB, application, interview, panelists };
}

describe("Release 1 Module 2 — Interview Workspace", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("getOrCreateInterviewScore is idempotent and creates one row per panellist", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpInterview(admin.id);
    try {
      const panelistId = fixture.panelists[0].userId;
      const first = await getOrCreateInterviewScore(panelistId, fixture.interview.id);
      const second = await getOrCreateInterviewScore(panelistId, fixture.interview.id);
      expect(second.id).toBe(first.id);
      expect(first.status).toBe("DRAFT");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("denies getOrCreateInterviewScore to someone not on this interview's panel", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpInterview(admin.id);
    // Created only after setUpInterview's autoAssignPanel has already run
    // and picked its 4 — otherwise this account could itself be one of
    // the 4 selected (equal workload, arbitrary order among the pool),
    // making the "not on the panel" premise flaky. Same pattern as the
    // Module 1 reassignPanelist test fix.
    const { user: outsider } = await createTestUser({ role: Role.INTERVIEWER });
    try {
      await expect(getOrCreateInterviewScore(outsider.id, fixture.interview.id)).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("denies interviews.score to a role that doesn't hold it", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpInterview(admin.id);
    try {
      await expect(getOrCreateInterviewScore(reviewer.id, fixture.interview.id)).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("saveDraftInterviewScores persists a partial set of entries and recomputes the weighted total", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpInterview(admin.id);
    try {
      const panelistId = fixture.panelists[0].userId;
      const score = await getOrCreateInterviewScore(panelistId, fixture.interview.id);

      const breakdown = await saveDraftInterviewScores(panelistId, {
        interviewScoreId: score.id,
        scores: [{ criterionId: fixture.criterionA.id, score: "8" }],
      });

      // Only criterion A scored (weight 1): 8 × 1 = 8.
      expect(breakdown.total.toString()).toBe("8");

      const reloaded = await prisma.interviewScore.findUniqueOrThrow({ where: { id: score.id } });
      expect(reloaded.status).toBe("DRAFT");
      expect(reloaded.totalScore?.toString()).toBe("8");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("saveDraftInterviewScores rejects a caller who doesn't own the score row", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpInterview(admin.id);
    try {
      const [owner, other] = fixture.panelists;
      const score = await getOrCreateInterviewScore(owner.userId, fixture.interview.id);

      await expect(
        saveDraftInterviewScores(other.userId, { interviewScoreId: score.id, scores: [{ criterionId: fixture.criterionA.id, score: "5" }] }),
      ).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("submitInterviewScore rejects an empty submission", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpInterview(admin.id);
    try {
      const panelistId = fixture.panelists[0].userId;
      const score = await getOrCreateInterviewScore(panelistId, fixture.interview.id);

      await expect(submitInterviewScore(panelistId, { interviewScoreId: score.id, scores: [] })).rejects.toBeInstanceOf(
        IncompleteReviewError,
      );
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("submitInterviewScore locks the score, computes the weighted total, and audits the submission", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpInterview(admin.id);
    try {
      const panelistId = fixture.panelists[0].userId;
      const score = await getOrCreateInterviewScore(panelistId, fixture.interview.id);

      const breakdown = await submitInterviewScore(panelistId, {
        interviewScoreId: score.id,
        scores: [
          { criterionId: fixture.criterionA.id, score: "8" },
          { criterionId: fixture.criterionB.id, score: "6" },
        ],
        overallAssessment: "Strong candidate.",
        strengths: "Clear communicator.",
        concerns: "Limited domain experience.",
        recommendation: "RECOMMEND",
      });

      // (8 × 1) + (6 × 2) = 20
      expect(breakdown.total.toString()).toBe("20");

      const reloaded = await prisma.interviewScore.findUniqueOrThrow({ where: { id: score.id } });
      expect(reloaded.status).toBe("SUBMITTED");
      expect(reloaded.submittedAt).not.toBeNull();
      expect(reloaded.overallAssessment).toBe("Strong candidate.");
      expect(reloaded.strengths).toBe("Clear communicator.");
      expect(reloaded.concerns).toBe("Limited domain experience.");
      expect(reloaded.recommendation).toBe("RECOMMEND");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "INTERVIEW_SCORE_SUBMITTED", entityId: score.id },
      });
      expect(audit).not.toBeNull();

      // A second submission on an already-SUBMITTED score is rejected, never double-processed.
      await expect(
        submitInterviewScore(panelistId, { interviewScoreId: score.id, scores: [{ criterionId: fixture.criterionA.id, score: "9" }] }),
      ).rejects.toBeInstanceOf(ReviewAlreadySubmittedError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("keeps each panellist's score independent — never leaks one panellist's entries into another's", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpInterview(admin.id);
    try {
      const [panelistA, panelistB] = fixture.panelists;
      const scoreA = await getOrCreateInterviewScore(panelistA.userId, fixture.interview.id);
      const scoreB = await getOrCreateInterviewScore(panelistB.userId, fixture.interview.id);
      expect(scoreA.id).not.toBe(scoreB.id);

      await submitInterviewScore(panelistA.userId, {
        interviewScoreId: scoreA.id,
        scores: [{ criterionId: fixture.criterionA.id, score: "10" }],
      });

      // Panellist B's own workspace view only ever returns B's own score row.
      const viewForB = await getInterviewWorkspaceView(panelistB.userId, fixture.interview.id);
      expect(viewForB.score.id).toBe(scoreB.id);
      expect(viewForB.score.status).toBe("DRAFT");
      expect(viewForB.submittedCount).toBe(1);
      expect(viewForB.totalPanelists).toBe(4);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("submitInterviewScore is blocked once the cohort's INTERVIEW programme window has closed", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpInterview(admin.id);
    try {
      await prisma.programmeWindow.create({
        data: {
          programmeId: fixture.programme.id,
          cohortId: fixture.cohort.id,
          code: "INTERVIEW",
          closesAt: new Date(Date.now() - 86_400_000),
        },
      });

      const panelistId = fixture.panelists[0].userId;
      const score = await getOrCreateInterviewScore(panelistId, fixture.interview.id);

      await expect(
        submitInterviewScore(panelistId, { interviewScoreId: score.id, scores: [{ criterionId: fixture.criterionA.id, score: "5" }] }),
      ).rejects.toBeInstanceOf(ReviewPeriodClosedError);

      // Draft saves are unaffected by a closed window (mirrors the review side).
      await expect(
        saveDraftInterviewScores(panelistId, { interviewScoreId: score.id, scores: [{ criterionId: fixture.criterionA.id, score: "5" }] }),
      ).resolves.toBeDefined();
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });
});

describe("Addendum Module 2 — Interview Scoring Revision", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  /** Submits a valid single-criterion score for each of the given panellists. */
  async function submitForPanelists(fixture: Awaited<ReturnType<typeof setUpInterview>>, panelists: { userId: string }[]) {
    for (const panelist of panelists) {
      const score = await getOrCreateInterviewScore(panelist.userId, fixture.interview.id);
      await submitInterviewScore(panelist.userId, {
        interviewScoreId: score.id,
        scores: [{ criterionId: fixture.criterionA.id, score: "8" }],
      });
    }
  }

  it("submitting the 4th score computes and stores ApplicationScore.interviewAverage", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpInterview(admin.id);
    try {
      await submitForPanelists(fixture, fixture.panelists);

      const applicationScore = await prisma.applicationScore.findUnique({ where: { applicationId: fixture.application.id } });
      expect(applicationScore).not.toBeNull();
      expect(applicationScore?.interviewAverage?.toString()).toBe("8");
      expect(applicationScore?.interviewScoreCount).toBe(4);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("a panellist's own workspace view exposes the average only once the threshold is met, never before", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const fixture = await setUpInterview(admin.id);
    try {
      const [panelistA, panelistB] = fixture.panelists;
      await submitForPanelists(fixture, [panelistA]);

      const viewBefore = await getInterviewWorkspaceView(panelistB.userId, fixture.interview.id);
      expect(viewBefore.interviewAverage).toBeNull();
      expect(viewBefore.scoringClosed).toBe(false);

      await submitForPanelists(fixture, fixture.panelists.slice(1));

      const viewAfter = await getInterviewWorkspaceView(panelistB.userId, fixture.interview.id);
      expect(viewAfter.interviewAverage?.toString()).toBe("8");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("closeInterviewWithOverride rejects when more than one panellist is missing", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const fixture = await setUpInterview(admin.id);
    try {
      await submitForPanelists(fixture, fixture.panelists.slice(0, 2));

      await expect(
        closeInterviewWithOverride(secretary.id, { interviewId: fixture.interview.id, reason: "Two panellists unresponsive." }),
      ).rejects.toBeInstanceOf(InsufficientSubmissionsError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("closeInterviewWithOverride on 3-of-4 closes the interview, computes the average from 3, and audits with the missing panellist recorded", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const fixture = await setUpInterview(admin.id);
    try {
      const [submitted1, submitted2, submitted3, missing] = fixture.panelists;
      await submitForPanelists(fixture, [submitted1, submitted2, submitted3]);

      await closeInterviewWithOverride(secretary.id, {
        interviewId: fixture.interview.id,
        reason: "Fourth panellist unreachable after repeated attempts.",
      });

      const interview = await prisma.interview.findUniqueOrThrow({ where: { id: fixture.interview.id } });
      expect(interview.scoringOverrideAt).not.toBeNull();
      expect(interview.scoringOverrideById).toBe(secretary.id);
      expect(interview.scoringOverrideMissingPanelistId).toBe(missing.userId);

      const applicationScore = await prisma.applicationScore.findUnique({ where: { applicationId: fixture.application.id } });
      expect(applicationScore?.interviewAverage?.toString()).toBe("8");
      expect(applicationScore?.interviewScoreCount).toBe(3);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "INTERVIEW_SCORING_CLOSED_WITH_OVERRIDE", entityId: fixture.interview.id },
      });
      expect(audit).not.toBeNull();
      expect((audit?.metadata as { missingPanelistId?: string } | null)?.missingPanelistId).toBe(missing.userId);

      // The missing 4th panellist can no longer submit after the override closes the interview.
      const missingScore = await getOrCreateInterviewScore(missing.userId, fixture.interview.id);
      await expect(
        submitInterviewScore(missing.userId, { interviewScoreId: missingScore.id, scores: [{ criterionId: fixture.criterionA.id, score: "5" }] }),
      ).rejects.toBeInstanceOf(InterviewScoringClosedError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("getInterviewScoreOverviewForSecretariat rejects a plain interviewer and succeeds for the Programme Secretariat with all rows visible", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const fixture = await setUpInterview(admin.id);
    try {
      await submitForPanelists(fixture, fixture.panelists);
      const outsidePanelist = fixture.panelists[0];

      await expect(getInterviewScoreOverviewForSecretariat(outsidePanelist.userId, fixture.interview.id)).rejects.toBeInstanceOf(
        AuthorisationError,
      );

      const overview = await getInterviewScoreOverviewForSecretariat(secretary.id, fixture.interview.id);
      expect(overview.scores).toHaveLength(4);
      expect(overview.scores.every((s) => s.status === "SUBMITTED")).toBe(true);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });
});
