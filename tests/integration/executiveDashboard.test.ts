import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Prisma, Role } from "@/lib/generated/prisma/client";
import { AuthorisationError } from "@/lib/errors";
import { generateFinalRanking } from "@/modules/ranking/services/rankingService";
import { recordApprovalStageDecision } from "@/modules/executiveApproval/services/executiveApprovalService";
import { getExecutiveDashboard } from "@/modules/executiveApproval/services/executiveDashboardService";

import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

async function setApplicationScore(applicationId: string, cohortId: string, review = "50", interview = "35") {
  return prisma.applicationScore.upsert({
    where: { applicationId },
    create: { applicationId, cohortId, reviewAverage: new Prisma.Decimal(review), interviewAverage: new Prisma.Decimal(interview) },
    update: { reviewAverage: new Prisma.Decimal(review), interviewAverage: new Prisma.Decimal(interview) },
  });
}

describe("Executive Dashboard (Planning Phase 4)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("denies a role without EXECUTIVE_VIEW", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await expect(getExecutiveDashboard(reviewer.id, cohort.id)).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("returns summary counts and a null ranking section before any ranking has been generated", async () => {
    const { user: executive } = await createTestUser({ role: Role.EXECUTIVE });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await createTestApplication(cohort.id, { eligibilityStatus: "ELIGIBLE" });
      await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await createTestApplication(cohort.id, { eligibilityStatus: "INELIGIBLE" });

      const dashboard = await getExecutiveDashboard(executive.id, cohort.id);

      expect(dashboard.totalApplications).toBe(3);
      expect(dashboard.eligibilityCounts).toEqual({ eligible: 1, ineligible: 1, pending: 1, clarificationRequired: 0, disqualified: 0 });
      expect(dashboard.snapshot).toBeNull();
      expect(dashboard.entries).toEqual([]);
      expect(dashboard.approval).toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("computes the Top 70/Top 60/Final Selection brackets against real ranked entries and reflects approval-stage progress", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: executive } = await createTestUser({ role: Role.EXECUTIVE });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: top } = await createTestApplication(cohort.id);
      const { application: second } = await createTestApplication(cohort.id);
      await setApplicationScore(top.id, cohort.id, "58", "39");
      await setApplicationScore(second.id, cohort.id, "50", "35");

      const { snapshot } = await generateFinalRanking(secretary.id, { cohortId: cohort.id });

      const before = await getExecutiveDashboard(executive.id, cohort.id);
      expect(before.snapshot).not.toBeNull();
      expect(before.entries).toHaveLength(2);
      const rank1 = before.entries.find((e) => e.rank === 1)!;
      expect(rank1.withinTop70).toBe(true);
      expect(rank1.withinTop60).toBe(true);
      // targetSize for a freshly generated snapshot with 2 applications is small, so a rank-1 entry is within Final Selection too.
      expect(rank1.withinFinalSelection).toBe(true);
      expect(before.approval).not.toBeNull();
      expect(before.approval!.currentStatus).toBe("NOT_STARTED");
      expect(before.approval!.nextActionableStage).toBe("TOP_70");

      await recordApprovalStageDecision(executive.id, { rankingSnapshotId: snapshot.id, stage: "TOP_70", decision: "APPROVED" });

      const after = await getExecutiveDashboard(executive.id, cohort.id);
      expect(after.approval!.currentStatus).toBe("TOP_70_APPROVED");
      expect(after.approval!.nextActionableStage).toBe("TOP_60");
      expect(after.approval!.stages).toHaveLength(1);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
