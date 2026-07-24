import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError, ValidationError } from "@/lib/errors";
import { getSettingValue, setSettingValue } from "@/lib/settings/service";
import { FEATURE_FLAGS, getFeatureFlagsForAdmin, isFeatureEnabled, setFeatureFlag } from "@/lib/featureFlags/service";
import {
  getProgrammeConfiguration,
  getSettingsForCategory,
  updateProgrammeDetails,
  updateProgrammeWindow,
  updateSetting,
} from "@/modules/configuration/services/configurationService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

describe("Release 1.5 — Configuration Centre", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("returns each setting's registry default when no row exists yet", async () => {
    // A key this suite has never written to. Default is 4 as of Release 1
    // Module 1 ("Four panellists per applicant" — see lib/settings/registry.ts).
    const value = await getSettingValue("interview.panellist_count");
    expect(value).toBe(4);
  });

  it("updateSetting validates range, persists, and audits the change with old/new values", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });

    await updateSetting(admin.id, "review.reminder_frequency_days", 7);
    const value = await getSettingValue("review.reminder_frequency_days");
    expect(value).toBe(7);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "CONFIGURATION_UPDATED", entityId: "review.reminder_frequency_days" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(admin.id);
    expect((audit?.metadata as { to: number })?.to).toBe(7);

    // Reset so other tests/dev-server default behaviour is unaffected.
    await setSettingValue("review.reminder_frequency_days", 3, admin.id);
  });

  it("rejects a value outside the setting's configured range", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    await expect(updateSetting(admin.id, "security.password_min_length", 3)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects writing to a read-only setting", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    await expect(updateSetting(admin.id, "review.blind_review_enabled", false)).rejects.toBeInstanceOf(ValidationError);
  });

  it("denies Configuration Centre access to a role outside Director/Secretary/Admin", async () => {
    const { user: reviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    await expect(getSettingsForCategory(reviewer.id, "security")).rejects.toBeInstanceOf(AuthorisationError);
    await expect(updateSetting(reviewer.id, "review.reminder_frequency_days", 5)).rejects.toBeInstanceOf(AuthorisationError);
  });

  it("grants view+manage to Programme Secretary, Programme Director, and System Administrator", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { user: director } = await createTestUser({ role: Role.PROGRAMME_DIRECTOR });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });

    for (const actor of [secretary, director, admin]) {
      await expect(getSettingsForCategory(actor.id, "review")).resolves.toBeDefined();
    }
  });

  it("Programme Configuration: updates Programme/Cohort fields and a ProgrammeWindow, both audited", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    await prisma.cohort.update({ where: { id: cohort.id }, data: { isActive: true } });

    try {
      await updateProgrammeDetails(admin.id, programme.id, { name: "Renamed Programme", code: "R1-5" });
      const updatedProgramme = await prisma.programme.findUniqueOrThrow({ where: { id: programme.id } });
      expect(updatedProgramme.name).toBe("Renamed Programme");
      expect(updatedProgramme.code).toBe("R1-5");

      await updateProgrammeWindow(admin.id, programme.id, cohort.id, {
        code: "INTERVIEW",
        opensAt: "2026-09-01T00:00:00.000Z",
        closesAt: "2026-09-30T00:00:00.000Z",
      });

      const config = await getProgrammeConfiguration(admin.id, programme.id);
      expect(config.windows.INTERVIEW.opensAt).toBe("2026-09-01T00:00:00.000Z");

      const windowAudit = await prisma.auditLog.findFirst({
        where: { action: "PROGRAMME_WINDOW_UPDATED", programmeId: programme.id },
      });
      expect(windowAudit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});

describe("Release 1.5 — Feature Flags", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("defaults 'exports' and 'interview_module' on (already-built features) and every not-yet-built feature off", async () => {
    expect(await isFeatureEnabled(FEATURE_FLAGS.EXPORTS)).toBe(true);
    expect(await isFeatureEnabled(FEATURE_FLAGS.INTERVIEW_MODULE)).toBe(true);
    expect(await isFeatureEnabled(FEATURE_FLAGS.NOTIFICATIONS)).toBe(false);
    expect(await isFeatureEnabled(FEATURE_FLAGS.EXECUTIVE_DASHBOARD)).toBe(false);
    expect(await isFeatureEnabled(FEATURE_FLAGS.ANALYTICS)).toBe(false);
    expect(await isFeatureEnabled(FEATURE_FLAGS.AI_ASSISTANT)).toBe(false);
  });

  it("only System Administrator can manage feature flags", async () => {
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    await expect(getFeatureFlagsForAdmin(secretary.id)).rejects.toBeInstanceOf(AuthorisationError);
  });

  it("toggling a flag persists and is readable through isFeatureEnabled", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    await setFeatureFlag(FEATURE_FLAGS.ANALYTICS, true, admin.id);
    expect(await isFeatureEnabled(FEATURE_FLAGS.ANALYTICS)).toBe(true);

    // Reset.
    await setFeatureFlag(FEATURE_FLAGS.ANALYTICS, false, admin.id);
    expect(await isFeatureEnabled(FEATURE_FLAGS.ANALYTICS)).toBe(false);
  });
});
