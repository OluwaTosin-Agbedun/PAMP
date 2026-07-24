import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { publishReviewFramework } from "@/modules/reviews/services/frameworkService";
import { createReview, recalculateReview, submitReview } from "@/modules/reviews/services/reviewService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import {
  cleanupReviewFixtures,
  createTestApplication,
  createTestCriterion,
  createTestProgrammeAndCohort,
  createTestReviewAssignment,
  createTestStageAndDraftFramework,
} from "../helpers/reviewFixtures";

describe("review data integrity (real Postgres, §25.4)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  it("the database itself refuses a second score row for the same (review, criterion) pair", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      const criterion = await createTestCriterion(framework.id, { code: "A", maxScore: "10" });
      await publishReviewFramework(admin.id, { frameworkId: framework.id });
      const { application } = await createTestApplication(cohort.id);
      const assignment = await createTestReviewAssignment(application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);

      await prisma.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score: "5" } });

      await expect(
        prisma.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score: "6" } }),
      ).rejects.toThrow();

      const rows = await prisma.reviewScore.findMany({ where: { reviewId: review.id, criterionId: criterion.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].score.toString()).toBe("5");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("a submitted review keeps pointing at the exact framework version it was scored against, even after a newer version is published", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { stage, framework: v1 } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      const criterionV1 = await createTestCriterion(v1.id, { code: "A", maxScore: "10" });
      await publishReviewFramework(admin.id, { frameworkId: v1.id });

      const { application } = await createTestApplication(cohort.id);
      const assignment = await createTestReviewAssignment(application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);
      await submitReview(reviewer.id, { reviewId: review.id, scores: [{ criterionId: criterionV1.id, score: "7" }] });

      // Publish v2 (same stage max, different criterion label) — v1 becomes RETIRED.
      const v2 = await prisma.reviewFramework.create({
        data: { reviewStageId: stage.id, programmeId: programme.id, cohortId: cohort.id, version: 2, status: "DRAFT" },
      });
      await createTestCriterion(v2.id, { code: "A", label: "Revised Criterion A", maxScore: "10" });
      await publishReviewFramework(admin.id, { frameworkId: v2.id });

      const persistedReview = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
      expect(persistedReview.reviewFrameworkId).toBe(v1.id);

      const usedFramework = await prisma.reviewFramework.findUniqueOrThrow({ where: { id: persistedReview.reviewFrameworkId } });
      expect(usedFramework.version).toBe(1);
      expect(usedFramework.status).toBe("RETIRED");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("recalculateReview keeps the stored total equal to the calculated total, and is a no-op audit-wise when nothing drifted", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { framework } = await createTestStageAndDraftFramework(programme.id, cohort.id, { maxTotalScore: "10" });
      const criterion = await createTestCriterion(framework.id, { code: "A", maxScore: "10" });
      await publishReviewFramework(admin.id, { frameworkId: framework.id });
      const { application } = await createTestApplication(cohort.id);
      const assignment = await createTestReviewAssignment(application.id, reviewer.id);
      const review = await createReview(reviewer.id, assignment.id);
      await submitReview(reviewer.id, { reviewId: review.id, scores: [{ criterionId: criterion.id, score: "6" }] });

      await recalculateReview(admin.id, review.id);
      const noDriftAudits = await prisma.auditLog.count({ where: { action: "REVIEW_RECALCULATED", entityId: review.id } });
      expect(noDriftAudits).toBe(0);

      // Simulate drift: directly corrupt the persisted total (bypassing the service).
      await prisma.review.update({ where: { id: review.id }, data: { totalScore: "999" } });
      await recalculateReview(admin.id, review.id);

      const corrected = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
      expect(corrected.totalScore?.toString()).toBe("6");

      const driftAudit = await prisma.auditLog.findFirst({ where: { action: "REVIEW_RECALCULATED", entityId: review.id } });
      expect(driftAudit).not.toBeNull();
      expect((driftAudit?.metadata as { from?: string; to?: string })?.from).toBe("999");
      expect((driftAudit?.metadata as { from?: string; to?: string })?.to).toBe("6");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
