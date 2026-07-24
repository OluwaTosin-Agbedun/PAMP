import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError, ConflictError } from "@/lib/errors";
import { ensureAuditContext, getAuditContext } from "@/lib/audit/context";
import { writeAuditLog } from "@/lib/audit/log";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import {
  createRecommendation,
  dismissRecommendation,
  executeOverride,
  listPendingRecommendations,
} from "@/modules/eligibilityQa/services/recommendationService";
import { getRiskDashboard } from "@/modules/reviewOperations/services/dashboardService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

/** `createRecommendation` reads `EligibilityScreening` (the real decision
 *  source of truth), not the retired `EligibilityDecision` model. */
async function withEligibilityDecision(cohortId: string, isEligible: boolean) {
  const status = isEligible ? "ELIGIBLE" : "INELIGIBLE";
  const { application } = await createTestApplication(cohortId, { eligibilityStatus: status });
  await prisma.eligibilityScreening.create({ data: { applicationId: application.id, status } });
  return application;
}

describe("Release 1.5 — Eligibility QA governance", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("an Eligibility Reviewer can flag a case and recommend an override", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const application = await withEligibilityDecision(cohort.id, false);

      const recommendation = await createRecommendation(reviewer.id, {
        applicationId: application.id,
        recommendedIsEligible: true,
        reason: "Applicant meets the criterion on manual re-check.",
      });

      expect(recommendation.status).toBe("PENDING");
      expect(recommendation.currentIsEligible).toBe(false);
      expect(recommendation.recommendedIsEligible).toBe(true);

      const audit = await prisma.auditLog.findFirst({ where: { action: "ELIGIBILITY_RECOMMENDATION_CREATED" } });
      expect(audit?.actorId).toBe(reviewer.id);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("root-cause regression: an Eligibility Reviewer can flag a case sitting Clarification Required, not only a terminal Eligible/Ineligible one", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "CLARIFICATION_REQUIRED" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id, status: "CLARIFICATION_REQUIRED" } });

      const recommendation = await createRecommendation(reviewer.id, {
        applicationId: application.id,
        recommendedIsEligible: true,
        reason: "Applicant provided the missing document directly to the Secretariat.",
      });

      expect(recommendation.status).toBe("PENDING");
      expect(recommendation.currentIsEligible).toBe(false); // Clarification Required is not Eligible
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("an Eligibility Reviewer cannot flag a case that has never been screened at all", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id, status: "PENDING_SCREENING" } });

      await expect(
        createRecommendation(reviewer.id, { applicationId: application.id, recommendedIsEligible: true, reason: "Too early." }),
      ).rejects.toThrow();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("an Eligibility Reviewer can no longer perform screening directly (recommend-only)", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const granted = permissionsForRole(Role.ELIGIBILITY_REVIEWER);
    expect(granted).not.toContain(PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM);
    expect(granted).toContain(PERMISSIONS.ELIGIBILITY_RECOMMENDATIONS_CREATE);
    expect(granted).toContain(PERMISSIONS.ELIGIBILITY_SCREENING_VIEW);
    void reviewer;
  });

  it("an Application Reviewer (wrong role) cannot create a recommendation", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const application = await withEligibilityDecision(cohort.id, true);
      await expect(
        createRecommendation(reviewer.id, { applicationId: application.id, recommendedIsEligible: false, reason: "Not this role's job." }),
      ).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("the Eligibility Reviewer who raised a recommendation cannot execute it themselves", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const application = await withEligibilityDecision(cohort.id, false);
      const recommendation = await createRecommendation(reviewer.id, {
        applicationId: application.id,
        recommendedIsEligible: true,
        reason: "Applicant meets the criterion on manual re-check.",
      });

      await expect(executeOverride(reviewer.id, recommendation.id)).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("only Programme Secretariat can execute an approved override, and it flips eligibilityStatus (never touched by the reviewer)", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const application = await withEligibilityDecision(cohort.id, false);
      const recommendation = await createRecommendation(reviewer.id, {
        applicationId: application.id,
        recommendedIsEligible: true,
        reason: "Applicant meets the criterion on manual re-check.",
      });

      await executeOverride(secretary.id, recommendation.id, "Confirmed against submitted transcript.");

      const updatedApplication = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(updatedApplication.eligibilityStatus).toBe("ELIGIBLE");

      // Root-cause regression: execution must sync EligibilityScreening
      // too, not just Application.eligibilityStatus alone — the two
      // records must never disagree about the current outcome.
      const screening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(screening.status).toBe("ELIGIBLE");
      expect(screening.decidedById).toBe(secretary.id);
      expect(screening.decidedAt).not.toBeNull();

      const resolved = await prisma.eligibilityRecommendation.findUniqueOrThrow({ where: { id: recommendation.id } });
      expect(resolved.status).toBe("EXECUTED");
      expect(resolved.executedById).toBe(secretary.id);

      const audit = await prisma.auditLog.findFirst({ where: { action: "ELIGIBILITY_OVERRIDE_EXECUTED" } });
      expect(audit?.actorId).toBe(secretary.id);

      // Cannot resolve the same recommendation twice.
      await expect(executeOverride(secretary.id, recommendation.id)).rejects.toBeInstanceOf(ConflictError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("dismissing a recommendation leaves eligibilityStatus untouched and is audited", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const application = await withEligibilityDecision(cohort.id, true);
      const recommendation = await createRecommendation(reviewer.id, {
        applicationId: application.id,
        recommendedIsEligible: false,
        reason: "Suspected duplicate submission.",
      });

      await dismissRecommendation(secretary.id, recommendation.id, "Confirmed not a duplicate.");

      const unchangedApplication = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(unchangedApplication.eligibilityStatus).toBe("ELIGIBLE");

      const resolved = await prisma.eligibilityRecommendation.findUniqueOrThrow({ where: { id: recommendation.id } });
      expect(resolved.status).toBe("DISMISSED");

      const audit = await prisma.auditLog.findFirst({ where: { action: "ELIGIBILITY_RECOMMENDATION_DISMISSED" } });
      expect(audit?.actorId).toBe(secretary.id);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("the pending recommendations queue is Secretariat-only and lists unresolved flags", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const application = await withEligibilityDecision(cohort.id, false);
      await createRecommendation(reviewer.id, { applicationId: application.id, recommendedIsEligible: true, reason: "Re-check requested." });

      const pending = await listPendingRecommendations(secretary.id);
      expect(pending.some((r) => r.applicationId === application.id)).toBe(true);

      await expect(listPendingRecommendations(reviewer.id)).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});

describe("Release 1.5 — Risk Dashboard", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("resolves for the Programme Secretariat and is denied for an Application Reviewer", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const risk = await getRiskDashboard(secretary.id, programme.id, cohort.id);
      expect(risk).toHaveProperty("applicationsRequiringAttention");
      expect(risk).toHaveProperty("thirdReviewRatePercent");

      await expect(getRiskDashboard(reviewer.id, programme.id, cohort.id)).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});

describe("Release 1.5 — Audit context enrichment", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("writeAuditLog picks up correlationId/requestId/sessionId/ipAddress/userAgent from the active AuditContext", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });

    // Outside a real request scope (this test), so establish one by
    // hand, the same shape `establishAuditContext` (lib/permissions/
    // guard.ts) sets up for a real page/action.
    const context = ensureAuditContext({ ipAddress: "203.0.113.7", userAgent: "vitest", sessionId: "test-session-id" });
    expect(getAuditContext()).toEqual(context);

    await writeAuditLog({ actorId: admin.id, action: "CONFIGURATION_UPDATED", entityType: "SystemSetting", entityId: "test.key" });

    const row = await prisma.auditLog.findFirst({ where: { actorId: admin.id, entityId: "test.key" }, orderBy: { createdAt: "desc" } });
    expect(row?.correlationId).toBe(context.correlationId);
    expect(row?.requestId).toBe(context.requestId);
    expect(row?.sessionId).toBe("test-session-id");
    expect(row?.ipAddress).toBe("203.0.113.7");
    expect(row?.userAgent).toBe("vitest");
  });

  it("an explicit field on the call always wins over the ambient context", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    ensureAuditContext({ correlationId: "ambient-correlation" });

    await writeAuditLog({
      actorId: admin.id,
      action: "CONFIGURATION_UPDATED",
      entityType: "SystemSetting",
      entityId: "test.key.explicit",
      correlationId: "explicit-correlation",
    });

    const row = await prisma.auditLog.findFirst({ where: { actorId: admin.id, entityId: "test.key.explicit" } });
    expect(row?.correlationId).toBe("explicit-correlation");
  });
});
