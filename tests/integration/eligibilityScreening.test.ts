import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError } from "@/lib/errors";
import {
  assignScreener,
  checkMissedClarificationDeadlines,
  escalate,
  extendClarificationDeadline,
  markDisqualified,
  markEligible,
  markIneligible,
  performSecondReview,
  reopenScreening,
  remediateExistingApplications,
  requestClarification,
  resolveClarification,
  runAutomaticEligibilityDecision,
  runAutomaticEligibilityForCohort,
} from "@/modules/eligibility/screeningService";
import { ALL_CHECKLIST_ITEMS } from "@/modules/eligibility/checklistDefinition";

import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

async function resolveEveryItem(applicationId: string, screenerId: string) {
  const screening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId } });
  await prisma.$transaction(
    ALL_CHECKLIST_ITEMS.map(({ section, item }) =>
      prisma.eligibilityChecklistItem.upsert({
        where: { screeningId_section_itemKey: { screeningId: screening.id, section, itemKey: item.key } },
        create: {
          screeningId: screening.id,
          section,
          itemKey: item.key,
          status: section === "INTEGRITY" ? "CLEAR" : "PASS",
          isAutomatic: false,
          updatedById: screenerId,
        },
        update: { status: section === "INTEGRITY" ? "CLEAR" : "PASS", isAutomatic: false, updatedById: screenerId },
      }),
    ),
  );
}

/** Builds an applicant/application that satisfies every gate item the automatic engine can verify. */
async function makeFullyPassingFixture(cohortId: string) {
  const { applicant, application } = await createTestApplication(cohortId, { eligibilityStatus: "PENDING" });
  const now = new Date();
  const closesAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.cohort.update({ where: { id: cohortId }, data: { applicationClosesAt: closesAt } });
  await prisma.applicant.update({
    where: { id: applicant.id },
    data: { nationality: "Nigerian", nyscStatus: "CURRENTLY_SERVING" },
  });
  await prisma.application.update({
    where: { id: application.id },
    data: { pathway: "Entrepreneurship & Enterprise", availabilityDeclared: true, submittedAt: now },
  });
  await prisma.applicationDocument.createMany({
    data: [
      { applicationId: application.id, type: "CV", fileName: "cv.pdf", storageKey: "cv.pdf" },
      { applicationId: application.id, type: "Degree Certificate", fileName: "degree.pdf", storageKey: "degree.pdf" },
      { applicationId: application.id, type: "NYSC Evidence", fileName: "nysc.pdf", storageKey: "nysc.pdf" },
      { applicationId: application.id, type: "Government ID Card", fileName: "id.pdf", storageKey: "id.pdf" },
      { applicationId: application.id, type: "Passport Photograph", fileName: "photo.jpg", storageKey: "photo.jpg" },
      { applicationId: application.id, type: "Personal Statement", fileName: "statement.pdf", storageKey: "statement.pdf" },
      { applicationId: application.id, type: "Motivation Letter", fileName: "motivation.pdf", storageKey: "motivation.pdf" },
    ],
  });
  await prisma.eligibilityScreening.create({ data: { applicationId: application.id } });
  return { applicant, application, closesAt };
}

describe("Eligibility Screening (real Postgres)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("root-cause regression: an application with no supporting data is never automatically marked Eligible — it's flagged for clarification instead", async () => {
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });

      // No documents, no NYSC status, no nationality, no pathway, no
      // submission timestamp on this test fixture — exactly the "empty"
      // state the old vacuous engine used to wave through as Eligible.
      const result = await runAutomaticEligibilityDecision(application.id);
      expect(result?.status).toBe("CLARIFICATION_REQUIRED");

      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("CLARIFICATION_REQUIRED");
      expect(reloaded.eligibilityStatus).not.toBe("ELIGIBLE");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("automatic engine marks a fully-passing application Eligible, advances stage, and writes an authoritative audit row", async () => {
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await makeFullyPassingFixture(cohort.id);

      const result = await runAutomaticEligibilityDecision(application.id);
      expect(result?.status).toBe("ELIGIBLE");
      expect(result?.decidedById).toBeNull();

      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("ELIGIBLE");
      expect(reloaded.stage).toBe("UNDER_REVIEW");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "ELIGIBILITY_AUTOMATIC_CHECK_PERFORMED", entityId: application.id },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).not.toBeNull();
      expect((audit?.metadata as Record<string, unknown> | null)?.authoritative).toBe(true);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("automatic engine marks Ineligible when a gate item explicitly fails (submitted after the deadline)", async () => {
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application, closesAt } = await makeFullyPassingFixture(cohort.id);
      await prisma.application.update({
        where: { id: application.id },
        data: { submittedAt: new Date(closesAt.getTime() + 24 * 60 * 60 * 1000) },
      });

      const result = await runAutomaticEligibilityDecision(application.id);
      expect(result?.status).toBe("INELIGIBLE");

      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("INELIGIBLE");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("automatic engine disqualifies an exact-duplicate application even when every other item passes", async () => {
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { applicant: firstApplicant } = await makeFullyPassingFixture(cohort.id);
      const { application: secondApplication, applicant: secondApplicant } = await makeFullyPassingFixture(cohort.id);
      await prisma.applicant.update({ where: { id: secondApplicant.id }, data: { phone: "+2348000000000" } });
      await prisma.applicant.update({ where: { id: firstApplicant.id }, data: { phone: "+2348000000000" } });

      const result = await runAutomaticEligibilityDecision(secondApplication.id);
      expect(result?.status).toBe("DISQUALIFIED");

      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: secondApplication.id } });
      expect(reloaded.eligibilityStatus).toBe("DISQUALIFIED");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("automatic engine never re-decides a screening a human (or the engine) has already confirmed", async () => {
    const { user: screener } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "INELIGIBLE" });
      await prisma.eligibilityScreening.create({
        data: { applicationId: application.id, status: "INELIGIBLE", decidedById: screener.id, decidedAt: new Date() },
      });

      const result = await runAutomaticEligibilityDecision(application.id);
      expect(result?.status).toBe("INELIGIBLE");
      expect(result?.decidedById).toBe(screener.id); // untouched — still the human's decision, not overwritten

      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("INELIGIBLE");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("bulk cohort run decides every pending application and skips ones already confirmed", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: screener } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: passingApp } = await makeFullyPassingFixture(cohort.id);
      const { application: emptyApp } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: emptyApp.id } });
      const { application: alreadyDecidedApp } = await createTestApplication(cohort.id, { eligibilityStatus: "ELIGIBLE" });
      await prisma.eligibilityScreening.create({
        data: { applicationId: alreadyDecidedApp.id, status: "ELIGIBLE", decidedById: screener.id, decidedAt: new Date() },
      });

      const result = await runAutomaticEligibilityForCohort(admin.id, cohort.id);
      expect(result.processed).toBe(2); // passingApp + emptyApp — alreadyDecidedApp was never queried

      const passingReloaded = await prisma.application.findUniqueOrThrow({ where: { id: passingApp.id } });
      expect(passingReloaded.eligibilityStatus).toBe("ELIGIBLE");
      const emptyReloaded = await prisma.application.findUniqueOrThrow({ where: { id: emptyApp.id } });
      expect(emptyReloaded.eligibilityStatus).toBe("CLARIFICATION_REQUIRED");

      const alreadyDecidedScreening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: alreadyDecidedApp.id } });
      expect(alreadyDecidedScreening.decidedById).toBe(screener.id); // untouched
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("assigning a screener rejects a user whose role can't perform screening", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: applicationReviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });

      await expect(assignScreener(secretary.id, { applicationId: application.id, screenerId: applicationReviewer.id })).rejects.toThrow();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("full happy path: assign, resolve checklist, mark Eligible, application progresses", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    // ELIGIBILITY_REVIEWER is recommend-only (see the QA governance
    // tests) — only a role holding ELIGIBILITY_SCREENING_PERFORM can
    // actually walk the checklist and decide directly.
    const { user: screener } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id } });

      await assignScreener(secretary.id, { applicationId: application.id, screenerId: screener.id });

      await expect(
        markEligible(screener.id, { applicationId: application.id, reasonForDecision: "Everything checks out." }),
      ).rejects.toThrow(); // checklist not yet resolved

      await resolveEveryItem(application.id, screener.id);

      await markEligible(screener.id, { applicationId: application.id, reasonForDecision: "Every requirement confirmed." });

      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("ELIGIBLE");
      expect(reloaded.stage).toBe("UNDER_REVIEW");

      const screening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(screening.status).toBe("ELIGIBLE");
      expect(screening.decidedById).toBe(screener.id);

      const audit = await prisma.auditLog.findFirst({ where: { action: "ELIGIBILITY_MARKED_ELIGIBLE", entityId: application.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("clarification cycle: request, then resolve, returns the application to PENDING for further screening", async () => {
    const { user: screener } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id } });

      await requestClarification(screener.id, { applicationId: application.id, outstandingClarification: "NYSC certificate is unreadable." });
      let reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("CLARIFICATION_REQUIRED");

      await resolveClarification(screener.id, application.id);
      reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("PENDING");

      const screening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(screening.status).toBe("IN_PROGRESS");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("requestClarification sets a deadline roughly the configured window away, and resolving it clears the deadline", async () => {
    const { user: screener } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id } });

      await requestClarification(screener.id, { applicationId: application.id, outstandingClarification: "NYSC certificate is unreadable." });
      const screening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(screening.clarificationDeadlineAt).not.toBeNull();
      const hoursAhead = (screening.clarificationDeadlineAt!.getTime() - Date.now()) / (60 * 60 * 1000);
      expect(hoursAhead).toBeGreaterThan(23);
      expect(hoursAhead).toBeLessThan(25);

      await resolveClarification(screener.id, application.id);
      const resolved = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(resolved.clarificationDeadlineAt).toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("checkMissedClarificationDeadlines auto-marks an overdue screening Ineligible, notifies, audits, and leaves a not-yet-due one untouched", async () => {
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application: overdue } = await createTestApplication(cohort.id, { eligibilityStatus: "CLARIFICATION_REQUIRED" });
      await prisma.eligibilityScreening.create({
        data: { applicationId: overdue.id, status: "CLARIFICATION_REQUIRED", clarificationDeadlineAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      const { application: notYetDue } = await createTestApplication(cohort.id, { eligibilityStatus: "CLARIFICATION_REQUIRED" });
      await prisma.eligibilityScreening.create({
        data: { applicationId: notYetDue.id, status: "CLARIFICATION_REQUIRED", clarificationDeadlineAt: new Date(Date.now() + 60 * 60 * 1000) },
      });

      const result = await checkMissedClarificationDeadlines();
      expect(result.processed).toBe(1);

      const overdueScreening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: overdue.id } });
      expect(overdueScreening.status).toBe("INELIGIBLE");
      expect(overdueScreening.reasonForDecision).toBe("Clarification deadline missed");
      expect(overdueScreening.decidedById).toBeNull();
      const overdueApplication = await prisma.application.findUniqueOrThrow({ where: { id: overdue.id } });
      expect(overdueApplication.eligibilityStatus).toBe("INELIGIBLE");

      const notYetDueScreening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: notYetDue.id } });
      expect(notYetDueScreening.status).toBe("CLARIFICATION_REQUIRED");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "ELIGIBILITY_CLARIFICATION_DEADLINE_MISSED", entityId: overdue.id },
      });
      expect(audit).not.toBeNull();

      // Naturally idempotent — the same overdue screening no longer
      // matches the CLARIFICATION_REQUIRED selection criteria.
      const second = await checkMissedClarificationDeadlines();
      expect(second.processed).toBe(0);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("extendClarificationDeadline is Secretariat-only, requires the screening to still be awaiting clarification, and audits the extension", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: reviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "CLARIFICATION_REQUIRED" });
      await prisma.eligibilityScreening.create({
        data: { applicationId: application.id, status: "CLARIFICATION_REQUIRED", clarificationDeadlineAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      await expect(
        extendClarificationDeadline(reviewer.id, { applicationId: application.id, reason: "Applicant asked for more time." }),
      ).rejects.toThrow(AuthorisationError);

      await extendClarificationDeadline(secretary.id, { applicationId: application.id, reason: "Applicant asked for more time by email." });
      const extended = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(extended.clarificationDeadlineAt!.getTime()).toBeGreaterThan(Date.now());
      expect(extended.clarificationDeadlineExtendedById).toBe(secretary.id);
      expect(extended.clarificationDeadlineExtensionReason).toBe("Applicant asked for more time by email.");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "ELIGIBILITY_CLARIFICATION_DEADLINE_EXTENDED", entityId: application.id },
      });
      expect(audit?.actorId).toBe(secretary.id);

      await resolveClarification(secretary.id, application.id);
      await expect(
        extendClarificationDeadline(secretary.id, { applicationId: application.id, reason: "Too late, already resolved." }),
      ).rejects.toThrow();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("marking Ineligible requires a reason and never requires the full checklist", async () => {
    const { user: screener } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id } });

      await markIneligible(screener.id, { applicationId: application.id, reasonForDecision: "Qualification below the accepted minimum." });

      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("INELIGIBLE");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("Disqualify requires the stricter permission — an Eligibility Reviewer (recommend-only) cannot invoke it", async () => {
    const { user: screener } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id } });

      await expect(
        markDisqualified(screener.id, { applicationId: application.id, integrityNote: "Suspected forged NYSC certificate." }),
      ).rejects.toThrow(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("Disqualify succeeds for a role holding the stricter permission and requires an integrity reason", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id } });

      await markDisqualified(secretary.id, { applicationId: application.id, integrityNote: "Confirmed duplicate application." });

      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("DISQUALIFIED");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("escalation records the escalated state without deciding eligibility", async () => {
    const { user: screener } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id } });

      await escalate(screener.id, { applicationId: application.id, reasonForDecision: "More than five years post-NYSC — possible exception." });

      const screening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(screening.status).toBe("ESCALATED");
      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("PENDING");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("the original screener cannot perform their own second review", async () => {
    const { user: screener } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id, screenerId: screener.id, secondReviewRequired: true } });

      await expect(performSecondReview(screener.id, { applicationId: application.id })).rejects.toThrow();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("a colleague can perform the second review once it's flagged as required", async () => {
    const { user: screener } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: colleague } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id, screenerId: screener.id, secondReviewRequired: true } });

      await performSecondReview(colleague.id, { applicationId: application.id, note: "Confirmed." });

      const screening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(screening.secondReviewerId).toBe(colleague.id);
      expect(screening.secondReviewCompletedAt).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("reopening a confirmed decision is System-Administrator-only", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: application.id } });
      await markIneligible(secretary.id, { applicationId: application.id, reasonForDecision: "Below minimum qualification." });

      await expect(
        reopenScreening(secretary.id, { applicationId: application.id, reason: "Trying as the wrong role." }),
      ).rejects.toThrow(AuthorisationError);

      await reopenScreening(admin.id, { applicationId: application.id, reason: "New qualification evidence submitted." });

      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.eligibilityStatus).toBe("PENDING");
      const screening = await prisma.eligibilityScreening.findUniqueOrThrow({ where: { applicationId: application.id } });
      expect(screening.status).toBe("IN_PROGRESS");
      expect(screening.reopenedById).toBe(admin.id);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("remediation resets a stale auto-approved application to PENDING without touching a real screener decision", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: screener } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      // Simulates the pre-fix state: ELIGIBLE with no real screening decision.
      const { application: staleApp } = await createTestApplication(cohort.id, { eligibilityStatus: "ELIGIBLE" });

      // A genuinely, freshly screener-decided application — must survive remediation untouched.
      // (Set up directly via Prisma rather than the full markEligible flow,
      // since only the presence of a real decidedById matters here, not
      // the checklist path that produces it.)
      const { application: decidedApp } = await createTestApplication(cohort.id, { eligibilityStatus: "PENDING" });
      await prisma.eligibilityScreening.create({ data: { applicationId: decidedApp.id } });
      await prisma.eligibilityScreening.update({
        where: { applicationId: decidedApp.id },
        data: { status: "ELIGIBLE", decidedById: screener.id, decidedAt: new Date() },
      });
      await prisma.application.update({ where: { id: decidedApp.id }, data: { eligibilityStatus: "ELIGIBLE", stage: "UNDER_REVIEW" } });

      const result = await remediateExistingApplications(admin.id, cohort.id);
      expect(result.remediated).toBe(1);

      const staleReloaded = await prisma.application.findUniqueOrThrow({ where: { id: staleApp.id } });
      expect(staleReloaded.eligibilityStatus).toBe("PENDING");

      const decidedReloaded = await prisma.application.findUniqueOrThrow({ where: { id: decidedApp.id } });
      expect(decidedReloaded.eligibilityStatus).toBe("ELIGIBLE"); // untouched

      // Idempotent: running again finds nothing left to remediate.
      const second = await remediateExistingApplications(admin.id, cohort.id);
      expect(second.remediated).toBe(0);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
