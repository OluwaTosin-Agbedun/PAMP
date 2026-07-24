import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Prisma, Role } from "@/lib/generated/prisma/client";
import { seedApplicationReviewCriteria } from "@/modules/reviews/seed/seedApplicationReviewCriteria";
import { seedInterviewCriteria } from "@/modules/interviews/seed/seedInterviewCriteria";

import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

/**
 * The PAM-P 2026 source documents give each stage's total directly (60
 * for Application Review, 40 for Panel Interview) — these tests assert
 * the seeded rows actually reproduce those totals, not just that rows
 * exist, since `maxScore`/`weight` are derived (marks ÷ 5, then
 * multiplied back by maxScore=5) rather than stored as the marks value
 * itself.
 */
describe("PAM-P criteria seed (real Postgres)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("seeds and publishes the Application Review framework, exactly once", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme } = await createTestProgrammeAndCohort();
    try {
      const stage = await prisma.reviewStage.create({
        data: {
          programmeId: programme.id,
          cohortId: null,
          name: "Application Review",
          code: "APPLICATION_REVIEW",
          maxTotalScore: new Prisma.Decimal("60"),
          status: "DRAFT",
        },
      });

      const first = await seedApplicationReviewCriteria(prisma, stage.id, admin.id);
      expect(first.created).toBe(true);
      expect(first.totalConfiguredScore).toBe("60");

      const framework = await prisma.reviewFramework.findUniqueOrThrow({
        where: { id: first.frameworkId },
        include: { criteria: true, ratingScales: { include: { bands: true } } },
      });
      expect(framework.status).toBe("PUBLISHED");
      expect(framework.criteria).toHaveLength(6);
      expect(framework.ratingScales[0]?.bands).toHaveLength(6);

      const reloadedStage = await prisma.reviewStage.findUniqueOrThrow({ where: { id: stage.id } });
      expect(reloadedStage.status).toBe("ACTIVE");

      const second = await seedApplicationReviewCriteria(prisma, stage.id, admin.id);
      expect(second.created).toBe(false);
      expect(second.frameworkId).toBe(first.frameworkId);
      expect(second.totalConfiguredScore).toBe("60");

      const frameworkCount = await prisma.reviewFramework.count({ where: { reviewStageId: stage.id } });
      expect(frameworkCount).toBe(1);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("seeds the 6 Panel Interview criteria for a cohort, exactly once", async () => {
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const first = await seedInterviewCriteria(prisma, cohort.id);
      expect(first.created).toBe(6);
      expect(first.totalConfiguredScore).toBe("40");

      const rows = await prisma.interviewCriterion.findMany({ where: { cohortId: cohort.id } });
      expect(rows).toHaveLength(6);

      const second = await seedInterviewCriteria(prisma, cohort.id);
      expect(second.created).toBe(0);
      expect(second.totalConfiguredScore).toBe("40");

      const rowsAfter = await prisma.interviewCriterion.findMany({ where: { cohortId: cohort.id } });
      expect(rowsAfter).toHaveLength(6);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
