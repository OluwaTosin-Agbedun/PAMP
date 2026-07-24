import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Prisma, Role } from "@/lib/generated/prisma/client";
import { AuthorisationError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { generateFinalRanking } from "@/modules/ranking/services/rankingService";
import { getApprovalStageHistory, recordApprovalStageDecision } from "@/modules/executiveApproval/services/executiveApprovalService";

import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

async function setApplicationScore(applicationId: string, cohortId: string) {
  return prisma.applicationScore.upsert({
    where: { applicationId },
    create: { applicationId, cohortId, reviewAverage: new Prisma.Decimal("50"), interviewAverage: new Prisma.Decimal("35") },
    update: { reviewAverage: new Prisma.Decimal("50"), interviewAverage: new Prisma.Decimal("35") },
  });
}

describe("Executive Approval Data Model (Planning Phase 3)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("denies a role without EXECUTIVE_APPROVE, even a Programme Director who only has EXECUTIVE_VIEW", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: director } = await createTestUser({ role: Role.PROGRAMME_DIRECTOR });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      await setApplicationScore(application.id, cohort.id);
      const { snapshot } = await generateFinalRanking(secretary.id, { cohortId: cohort.id });

      await expect(
        recordApprovalStageDecision(director.id, { rankingSnapshotId: snapshot.id, stage: "TOP_70", decision: "APPROVED" }),
      ).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("lets an EXECUTIVE user approve TOP_70, blocks TOP_60 until TOP_70 is approved, then allows the full sequence through to VERIFICATION_CONFIRMATION", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: executive } = await createTestUser({ role: Role.EXECUTIVE });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      await setApplicationScore(application.id, cohort.id);
      const { snapshot } = await generateFinalRanking(secretary.id, { cohortId: cohort.id });

      await expect(
        recordApprovalStageDecision(executive.id, { rankingSnapshotId: snapshot.id, stage: "TOP_60", decision: "APPROVED" }),
      ).rejects.toBeInstanceOf(ConflictError);

      const top70 = await recordApprovalStageDecision(executive.id, {
        rankingSnapshotId: snapshot.id,
        stage: "TOP_70",
        decision: "APPROVED",
      });
      expect(top70.newStatus).toBe("TOP_70_APPROVED");
      expect(top70.previousStatus).toBeNull();
      expect(top70.approverId).toBe(executive.id);

      // Already approved — can't re-decide.
      await expect(
        recordApprovalStageDecision(executive.id, { rankingSnapshotId: snapshot.id, stage: "TOP_70", decision: "APPROVED" }),
      ).rejects.toBeInstanceOf(ConflictError);

      const top60 = await recordApprovalStageDecision(executive.id, {
        rankingSnapshotId: snapshot.id,
        stage: "TOP_60",
        decision: "APPROVED",
      });
      expect(top60.previousStatus).toBe("TOP_70_APPROVED");
      expect(top60.newStatus).toBe("TOP_60_APPROVED");

      await recordApprovalStageDecision(executive.id, {
        rankingSnapshotId: snapshot.id,
        stage: "FINAL_SELECTION",
        decision: "APPROVED",
      });
      const final = await recordApprovalStageDecision(executive.id, {
        rankingSnapshotId: snapshot.id,
        stage: "VERIFICATION_CONFIRMATION",
        decision: "APPROVED",
      });
      expect(final.newStatus).toBe("VERIFICATION_CONFIRMATION_APPROVED");

      const history = await getApprovalStageHistory(secretary.id, snapshot.id);
      expect(history.stages).toHaveLength(4);
      expect(history.currentStatus).toBe("VERIFICATION_CONFIRMATION_APPROVED");

      const audit = await prisma.auditLog.findMany({ where: { action: "RANKING_APPROVAL_STAGE_RECORDED", entityId: snapshot.id } });
      expect(audit).toHaveLength(4);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("requires a comment when rejecting a stage, and allows the stage to be retried after rejection", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: executive } = await createTestUser({ role: Role.EXECUTIVE });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      await setApplicationScore(application.id, cohort.id);
      const { snapshot } = await generateFinalRanking(secretary.id, { cohortId: cohort.id });

      await expect(
        recordApprovalStageDecision(executive.id, { rankingSnapshotId: snapshot.id, stage: "TOP_70", decision: "REJECTED" }),
      ).rejects.toBeInstanceOf(ValidationError);

      const rejected = await recordApprovalStageDecision(executive.id, {
        rankingSnapshotId: snapshot.id,
        stage: "TOP_70",
        decision: "REJECTED",
        comment: "Two applicants need a fresh eligibility check before this list can proceed.",
      });
      expect(rejected.newStatus).toBe("TOP_70_REJECTED");
      expect(rejected.comment).toContain("eligibility check");

      // Retry after rejection is allowed.
      const approved = await recordApprovalStageDecision(executive.id, {
        rankingSnapshotId: snapshot.id,
        stage: "TOP_70",
        decision: "APPROVED",
      });
      expect(approved.previousStatus).toBe("TOP_70_REJECTED");
      expect(approved.newStatus).toBe("TOP_70_APPROVED");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("raises NotFoundError for a ranking snapshot that doesn't exist", async () => {
    const { user: executive } = await createTestUser({ role: Role.EXECUTIVE });
    await expect(
      recordApprovalStageDecision(executive.id, { rankingSnapshotId: "does-not-exist", stage: "TOP_70", decision: "APPROVED" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
