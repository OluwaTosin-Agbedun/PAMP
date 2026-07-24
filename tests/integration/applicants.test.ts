import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError, NotFoundError } from "@/lib/errors";
import { deleteApplicant } from "@/modules/applicants/service";
import { getApplicationDetail, listApplications } from "@/modules/applicants/repository";

import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

describe("Applicants — filters and deletion (real Postgres)", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("filters by zone (derived from state of origin), state, and gender", async () => {
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { applicant: lagosApplicant } = await createTestApplication(cohort.id);
      await prisma.applicant.update({ where: { id: lagosApplicant.id }, data: { stateOfOrigin: "Lagos", gender: "Female" } });

      const { applicant: kanoApplicant } = await createTestApplication(cohort.id);
      await prisma.applicant.update({ where: { id: kanoApplicant.id }, data: { stateOfOrigin: "Kano", gender: "Male" } });

      const zoneResult = await listApplications(cohort.id, { zone: "South West", page: 1, pageSize: 25 });
      expect(zoneResult.total).toBe(1);
      expect(zoneResult.items[0].applicant.stateOfOrigin).toBe("Lagos");

      const stateResult = await listApplications(cohort.id, { state: "Kano", page: 1, pageSize: 25 });
      expect(stateResult.total).toBe(1);
      expect(stateResult.items[0].applicant.stateOfOrigin).toBe("Kano");

      const genderResult = await listApplications(cohort.id, { gender: "Female", page: 1, pageSize: 25 });
      expect(genderResult.total).toBe(1);
      expect(genderResult.items[0].applicant.gender).toBe("Female");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("excludes soft-deleted applications from the default list", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);

      const before = await listApplications(cohort.id, { page: 1, pageSize: 25 });
      expect(before.total).toBe(1);

      await deleteApplicant(secretary.id, application.id, "Duplicate submission, keeping the other record.");

      const after = await listApplications(cohort.id, { page: 1, pageSize: 25 });
      expect(after.total).toBe(0);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("deleteApplicant requires APPLICATIONS_DELETE — an Application Reviewer cannot delete", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);

      await expect(deleteApplicant(reviewer.id, application.id, "Trying without permission.")).rejects.toBeInstanceOf(AuthorisationError);

      const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloaded.deletedAt).toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("deleteApplicant soft-deletes both the Application and its Applicant, and writes an audit row", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { applicant, application } = await createTestApplication(cohort.id);

      await deleteApplicant(secretary.id, application.id, "Applicant requested removal.");

      const reloadedApplication = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(reloadedApplication.deletedAt).not.toBeNull();
      const reloadedApplicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
      expect(reloadedApplicant.deletedAt).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({ where: { action: "APPLICANT_DELETED", entityId: application.id } });
      expect(audit).not.toBeNull();
      expect((audit?.metadata as Record<string, unknown> | null)?.reason).toBe("Applicant requested removal.");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("deleteApplicant on an already-deleted application throws NotFoundError rather than deleting twice", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      await deleteApplicant(secretary.id, application.id, "First deletion.");

      await expect(deleteApplicant(secretary.id, application.id, "Second attempt.")).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("getApplicationDetail still resolves a deleted application directly by id (soft delete only hides it from lists)", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      await deleteApplicant(secretary.id, application.id, "Reason.");

      const detail = await getApplicationDetail(application.id);
      expect(detail?.deletedAt).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
