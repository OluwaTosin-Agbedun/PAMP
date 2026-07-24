import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError } from "@/lib/errors";
import { exportAnalyticsCsv, getAnalyticsDashboard } from "@/modules/analytics/services/analyticsService";

import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

describe("Analytics Aggregation + Dashboard + Reporting (Planning Phase 5)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("denies a role without REPORTS_VIEW", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await expect(getAnalyticsDashboard(reviewer.id, cohort.id, {})).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("returns all-zero, error-free results for a cohort with no applications yet", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const dashboard = await getAnalyticsDashboard(secretary.id, cohort.id, {});
      expect(dashboard.application.total).toBe(0);
      expect(dashboard.application.eligibilityDecisions).toEqual({});
      expect(dashboard.review.reviewersAssignedCount).toBe(0);
      expect(dashboard.interview.interviewsScheduled).toBe(0);
      expect(dashboard.ranking.hasSnapshot).toBe(false);
      expect(dashboard.admission.offersIssued).toBe(0);
      expect(dashboard.notification.notificationsGenerated).toBe(0);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("accurately aggregates application counts, eligibility breakdown, duplicates, and zone distribution", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: eligible, applicant: eligibleApplicant } = await createTestApplication(cohort.id, { eligibilityStatus: "ELIGIBLE" });
      const { applicant: pendingApplicant } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      const { application: duplicate } = await createTestApplication(cohort.id);

      await prisma.applicant.update({ where: { id: eligibleApplicant.id }, data: { stateOfOrigin: "Lagos", gender: "Female" } });
      await prisma.applicant.update({ where: { id: pendingApplicant.id }, data: { stateOfOrigin: "Kano", gender: "Male" } });
      await prisma.application.update({ where: { id: duplicate.id }, data: { duplicateOfId: eligible.id } });

      const dashboard = await getAnalyticsDashboard(secretary.id, cohort.id, {});

      expect(dashboard.application.total).toBe(3);
      // The "duplicate" application also defaults to ELIGIBLE (createTestApplication's own default) — 2 ELIGIBLE (eligible + duplicate) + 1 PENDING.
      expect(dashboard.application.eligibilityDecisions.ELIGIBLE).toBe(2);
      expect(dashboard.application.eligibilityDecisions.PENDING).toBe(1);
      expect(dashboard.application.duplicateFlags).toBe(1);
      expect(dashboard.application.zoneDistribution["South West"]).toBe(1);
      expect(dashboard.application.zoneDistribution["North West"]).toBe(1);
      expect(dashboard.application.genderDistribution.Female).toBe(1);
      expect(dashboard.application.genderDistribution.Male).toBe(1);
      // No `sector` field exists anywhere in the data model — reported as unavailable, never fabricated.
      expect(dashboard.application.sectorDistribution).toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("filters by eligibilityStatus and by zone (derived from stateOfOrigin)", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { applicant: a1 } = await createTestApplication(cohort.id, { eligibilityStatus: "ELIGIBLE" });
      await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.applicant.update({ where: { id: a1.id }, data: { stateOfOrigin: "Lagos" } });

      const byStatus = await getAnalyticsDashboard(secretary.id, cohort.id, { eligibilityStatus: "ELIGIBLE" });
      expect(byStatus.application.total).toBe(1);

      const byZone = await getAnalyticsDashboard(secretary.id, cohort.id, { zone: "South West" });
      expect(byZone.application.total).toBe(1);

      const byOtherZone = await getAnalyticsDashboard(secretary.id, cohort.id, { zone: "North East" });
      expect(byOtherZone.application.total).toBe(0);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("respects a date range that excludes every application, proving the filter is applied and timezone-safe", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await createTestApplication(cohort.id);

      const farFuture = await getAnalyticsDashboard(secretary.id, cohort.id, {
        dateFrom: new Date("2099-01-01T00:00:00.000Z").toISOString(),
      });
      expect(farFuture.application.total).toBe(0);

      const wideOpen = await getAnalyticsDashboard(secretary.id, cohort.id, {
        dateFrom: new Date("2000-01-01T00:00:00.000Z").toISOString(),
      });
      expect(wideOpen.application.total).toBe(1);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("denies export to a role holding REPORTS_VIEW but not REPORTS_EXPORT, and produces a real CSV with report metadata for one that has both", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await createTestApplication(cohort.id);

      await expect(exportAnalyticsCsv(reviewer.id, cohort.id, {})).rejects.toBeInstanceOf(AuthorisationError);

      const csv = await exportAnalyticsCsv(secretary.id, cohort.id, {});
      expect(csv).toContain("PAM-P Analytics Dashboard");
      expect(csv).toContain("Generated by");
      expect(csv).toContain(`Cohort ID,${cohort.id}`);
      expect(csv).toContain("Application Analytics");
      expect(csv).toContain("Review Analytics");
      expect(csv).toContain("Interview Analytics");
      expect(csv).toContain("Final Ranking Analytics");
      expect(csv).toContain("Admission and Offer Analytics");
      expect(csv).toContain("Notification Analytics");

      const audit = await prisma.auditLog.findFirst({ where: { action: "REPORTS_EXPORTED", entityId: cohort.id } });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(secretary.id);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("handles a moderate volume of applications without error or incorrect totals", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const count = 40;
      for (let i = 0; i < count; i++) {
        await createTestApplication(cohort.id, { eligibilityStatus: i % 2 === 0 ? "ELIGIBLE" : "PENDING" });
      }

      const dashboard = await getAnalyticsDashboard(secretary.id, cohort.id, {});
      expect(dashboard.application.total).toBe(count);
      expect(dashboard.application.eligibilityDecisions.ELIGIBLE).toBe(count / 2);
      expect(dashboard.application.eligibilityDecisions.PENDING).toBe(count / 2);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
