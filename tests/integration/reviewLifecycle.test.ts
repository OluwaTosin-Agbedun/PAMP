import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError, IncompleteReviewError, InvalidScoreError, ReviewAlreadySubmittedError } from "@/lib/errors";
import { publishReviewFramework } from "@/modules/reviews/services/frameworkService";
import {
  createReview,
  reopenReview,
  saveDraftScores,
  submitReview,
} from "@/modules/reviews/services/reviewService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import {
  cleanupReviewFixtures,
  createTestApplication,
  createTestCriterion,
  createTestProgrammeAndCohort,
  createTestReviewAssignment,
  createTestStageAndDraftFramework,
} from "../helpers/reviewFixtures";

/** Builds a published 2-criterion (10 + 10 = 20) framework, an eligible
 *  application, and a review assignment ready for a reviewer to score. */
async function setUpPublishedReviewFixture(adminId: string) {
  const { programme, cohort } = await createTestProgrammeAndCohort();
  const { stage, framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "20" });
  const criterionA = await createTestCriterion(framework.id, { code: "A", label: "Criterion A", maxScore: "10", displayOrder: 0 });
  const criterionB = await createTestCriterion(framework.id, { code: "B", label: "Criterion B", maxScore: "10", displayOrder: 1 });
  await publishReviewFramework(adminId, { frameworkId: framework.id });
  const { application } = await createTestApplication(cohort.id);
  return { programme, cohort, stage, framework, criterionA, criterionB, application };
}

describe("review lifecycle (real Postgres)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  it("creates a review against the published framework, tied to the correct reviewer/application", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);

      expect(review.status).toBe("NOT_STARTED");
      expect(review.reviewerId).toBe(reviewer.id);
      expect(review.applicationId).toBe(fixture.application.id);
      expect(review.reviewFrameworkId).toBe(fixture.framework.id);

      // Idempotent: calling again for the same assignment returns the same row.
      const again = await createReview(reviewer.id, assignment.id);
      expect(again.id).toBe(review.id);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("rejects a reviewer creating a review for someone else's assignment", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: assignedReviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: otherReviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, assignedReviewer.id);
      await expect(createReview(otherReviewer.id, assignment.id)).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("saves partial draft scores, moving the review to IN_PROGRESS", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);

      const breakdown = await saveDraftScores(reviewer.id, {
        reviewId: review.id,
        scores: [{ criterionId: fixture.criterionA.id, score: "7" }],
      });
      expect(breakdown.criteria.find((c) => c.criterionId === fixture.criterionA.id)?.rawScore?.toString()).toBe("7");

      const updated = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
      expect(updated.status).toBe("IN_PROGRESS");
      expect(updated.totalScore?.toString()).toBe("7");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("rejects an out-of-range draft score", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);

      await expect(
        saveDraftScores(reviewer.id, { reviewId: review.id, scores: [{ criterionId: fixture.criterionA.id, score: "99" }] }),
      ).rejects.toBeInstanceOf(InvalidScoreError);

      const unchanged = await prisma.reviewScore.findMany({ where: { reviewId: review.id } });
      expect(unchanged).toHaveLength(0);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("rejects a score for a criterion from a different framework", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    const other = await createTestProgrammeAndCohort();
    try {
      const { framework: otherFramework } = await createTestStageAndDraftFramework(other.programme.id, other.cohort.id);
      const foreignCriterion = await createTestCriterion(otherFramework.id, { code: "FOREIGN" });

      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);

      await expect(
        saveDraftScores(reviewer.id, { reviewId: review.id, scores: [{ criterionId: foreignCriterion.id, score: "5" }] }),
      ).rejects.toBeInstanceOf(InvalidScoreError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
      await cleanupReviewFixtures(other.programme.id);
    }
  });

  it("submits a complete review, computing and locking in the total", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);

      const breakdown = await submitReview(reviewer.id, {
        reviewId: review.id,
        scores: [
          { criterionId: fixture.criterionA.id, score: "8" },
          { criterionId: fixture.criterionB.id, score: "6" },
        ],
        comments: "Solid application overall.",
      });
      expect(breakdown.total.toString()).toBe("14");

      const updated = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
      expect(updated.status).toBe("SUBMITTED");
      expect(updated.totalScore?.toString()).toBe("14");
      expect(updated.submittedAt).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({ where: { action: "REVIEW_SUBMITTED", entityId: review.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("rejects submitting an incomplete review (missing a mandatory criterion)", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);

      await expect(
        submitReview(reviewer.id, { reviewId: review.id, scores: [{ criterionId: fixture.criterionA.id, score: "8" }] }),
      ).rejects.toBeInstanceOf(IncompleteReviewError);

      const unchanged = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
      expect(unchanged.status).not.toBe("SUBMITTED");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("prevents further edits once a review is submitted", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);
      await submitReview(reviewer.id, {
        reviewId: review.id,
        scores: [
          { criterionId: fixture.criterionA.id, score: "5" },
          { criterionId: fixture.criterionB.id, score: "5" },
        ],
      });

      await expect(
        saveDraftScores(reviewer.id, { reviewId: review.id, scores: [{ criterionId: fixture.criterionA.id, score: "9" }] }),
      ).rejects.toBeInstanceOf(ReviewAlreadySubmittedError);

      await expect(
        submitReview(reviewer.id, {
          reviewId: review.id,
          scores: [
            { criterionId: fixture.criterionA.id, score: "5" },
            { criterionId: fixture.criterionB.id, score: "5" },
          ],
        }),
      ).rejects.toBeInstanceOf(ReviewAlreadySubmittedError);
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("a double submission (concurrent) does not create duplicate audit entries or an inconsistent total", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);
      const scores = [
        { criterionId: fixture.criterionA.id, score: "5" },
        { criterionId: fixture.criterionB.id, score: "5" },
      ];

      const results = await Promise.allSettled([
        submitReview(reviewer.id, { reviewId: review.id, scores }),
        submitReview(reviewer.id, { reviewId: review.id, scores }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);

      const submittedAudits = await prisma.auditLog.findMany({
        where: { action: "REVIEW_SUBMITTED", entityId: review.id },
      });
      expect(submittedAudits).toHaveLength(1);

      const finalReview = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
      expect(finalReview.totalScore?.toString()).toBe("10");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("authorised reopening restores editability, is audited with a reason, and recalculation follows resubmission", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);
      await submitReview(reviewer.id, {
        reviewId: review.id,
        scores: [
          { criterionId: fixture.criterionA.id, score: "5" },
          { criterionId: fixture.criterionB.id, score: "5" },
        ],
      });

      const reopened = await reopenReview(admin.id, { reviewId: review.id, reason: "Reviewer flagged a data entry error." });
      expect(reopened.status).toBe("REOPENED");
      expect(reopened.reopenedById).toBe(admin.id);

      const reopenAudit = await prisma.auditLog.findFirst({ where: { action: "REVIEW_REOPENED", entityId: review.id } });
      expect(reopenAudit).not.toBeNull();
      expect((reopenAudit?.metadata as { priorTotal?: string })?.priorTotal).toBe("10");
      expect((reopenAudit?.metadata as { priorScores?: unknown[] })?.priorScores).toHaveLength(2);

      const resubmitted = await submitReview(reviewer.id, {
        reviewId: review.id,
        scores: [
          { criterionId: fixture.criterionA.id, score: "9" },
          { criterionId: fixture.criterionB.id, score: "9" },
        ],
      });
      expect(resubmitted.total.toString()).toBe("18");

      const finalReview = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
      expect(finalReview.status).toBe("SUBMITTED");
      expect(finalReview.totalScore?.toString()).toBe("18");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });

  it("an Application Reviewer cannot reopen a submitted review", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const fixture = await setUpPublishedReviewFixture(admin.id);
    try {
      const assignment = await createTestReviewAssignment(fixture.application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);
      await submitReview(reviewer.id, {
        reviewId: review.id,
        scores: [
          { criterionId: fixture.criterionA.id, score: "5" },
          { criterionId: fixture.criterionB.id, score: "5" },
        ],
      });

      await expect(reopenReview(reviewer.id, { reviewId: review.id, reason: "Trying to self-reopen." })).rejects.toThrow();

      const unchanged = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
      expect(unchanged.status).toBe("SUBMITTED");
    } finally {
      await cleanupReviewFixtures(fixture.programme.id);
    }
  });
});
