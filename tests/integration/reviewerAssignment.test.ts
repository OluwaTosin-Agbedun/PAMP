import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError } from "@/lib/errors";
import { autoAssignRandomReviewer, autoAssignRandomReviewersForCohort, getEligibleReviewerPool } from "@/modules/eligibility/reviewerAssignment";
import { runAutomaticEligibilityDecision } from "@/modules/eligibility/screeningService";

import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

describe("Random eligibility reviewer assignment (real Postgres)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("assigns a reviewer drawn from the real pool of ACTIVE ELIGIBILITY_SCREENING_PERFORM holders", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id, status: "CLARIFICATION_REQUIRED" } });
      const screening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });

      const pool = await getEligibleReviewerPool();
      expect(pool).toContain(reviewer.id); // sanity: the test fixture itself is eligible

      const assignedId = await autoAssignRandomReviewer(screening.id, application.id, "CLARIFICATION_REQUIRED");
      expect(assignedId).not.toBeNull();
      expect(pool).toContain(assignedId);

      const reloaded = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(reloaded.screenerId).toBe(assignedId);
      expect(reloaded.assignedById).toBeNull(); // system-initiated
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("never reassigns a screening that already has a reviewer", async () => {
    await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id, status: "CLARIFICATION_REQUIRED" } });
      const screening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });

      const firstAssignment = await autoAssignRandomReviewer(screening.id, application.id, "CLARIFICATION_REQUIRED");
      expect(firstAssignment).not.toBeNull();

      const secondAssignment = await autoAssignRandomReviewer(screening.id, application.id, "CLARIFICATION_REQUIRED");
      expect(secondAssignment).toBeNull(); // already assigned — never reshuffled

      const reloaded = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(reloaded.screenerId).toBe(firstAssignment);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("root-cause regression: an application flagged Clarification Required by the automatic engine is never left Unassigned", async () => {
    await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });

      const result = await runAutomaticEligibilityDecision(application.id);
      expect(result?.status).toBe("CLARIFICATION_REQUIRED");
      expect(result?.screenerId).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("autoAssignRandomReviewersForCohort requires ELIGIBILITY_SCREENING_ASSIGN", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await expect(autoAssignRandomReviewersForCohort(reviewer.id, cohort.id)).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("bulk cohort assignment fills every unassigned not-yet-decided screening, leaves decided and already-assigned ones untouched", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: reviewer1 } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { user: reviewer2 } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: unassigned1 } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: unassigned1.id, status: "CLARIFICATION_REQUIRED" } });

      const { application: unassigned2 } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: unassigned2.id, status: "CLARIFICATION_REQUIRED" } });

      const { application: alreadyAssigned } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({
        data: { applicationId: alreadyAssigned.id, status: "CLARIFICATION_REQUIRED", screenerId: reviewer1.id, assignedById: secretary.id },
      });

      const { application: decided } = await createTestApplication(cohort.id, { eligibilityStatus: "ELIGIBLE" });
      await prisma.eligibilityScreening.create({ data: { applicationId: decided.id, status: "ELIGIBLE", decidedById: reviewer2.id } });

      const result = await autoAssignRandomReviewersForCohort(secretary.id, cohort.id);
      expect(result.processed).toBe(2); // only the two genuinely unassigned, not-yet-decided ones
      expect(result.assigned).toBe(2);

      const screening1 = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: unassigned1.id } });
      const screening2 = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: unassigned2.id } });
      expect(screening1.screenerId).not.toBeNull();
      expect(screening2.screenerId).not.toBeNull();

      const untouchedAssigned = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: alreadyAssigned.id } });
      expect(untouchedAssigned.screenerId).toBe(reviewer1.id); // unchanged

      const untouchedDecided = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: decided.id } });
      expect(untouchedDecided.screenerId).toBeNull(); // decided cases are never assigned a reviewer
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
