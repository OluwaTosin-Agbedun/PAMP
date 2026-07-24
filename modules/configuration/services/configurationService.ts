import "server-only";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";
import type { ProgrammeWindowCode } from "@/lib/generated/prisma/client";
import {
  getSettingValue,
  setSettingValue,
  listSettingsByCategory,
  type SettingCategory,
} from "@/lib/settings/service";

import * as repo from "../repositories/programmeRepository";
import type { ProgrammeConfigViewModel, SettingViewModel } from "../types";
import type {
  UpdateApplicationReviewWindowInput,
  UpdateCohortInput,
  UpdateProgrammeInput,
  UpdateProgrammeWindowInput,
} from "../validation/schemas";

const WINDOW_CODES: ProgrammeWindowCode[] = ["ELIGIBILITY_REVIEW", "INTERVIEW", "EXECUTIVE_APPROVAL", "OFFER"];

/** Every category screen reads through this — one function producing
 *  the exact view model every category's form renders from, so a new
 *  category is a new registry entries + one route, not new query logic
 *  (Release 1.5 brief: "Do not place aggregate query logic directly in
 *  page components," the same discipline Phase 3D's dashboard used). */
export async function getSettingsForCategory(actorId: string, category: SettingCategory): Promise<SettingViewModel[]> {
  await requirePermission(actorId, PERMISSIONS.CONFIGURATION_VIEW);

  const definitions = listSettingsByCategory(category);
  const values = await Promise.all(definitions.map((d) => getSettingValue(d.key)));

  return definitions.map((definition, index) => ({
    key: definition.key,
    category: definition.category,
    type: definition.type,
    label: definition.label,
    description: definition.description,
    value: values[index],
    default: definition.default,
    min: definition.min,
    max: definition.max,
    options: definition.options,
    readOnly: Boolean(definition.readOnly),
  }));
}

export async function updateSetting(actorId: string, key: string, value: number | boolean | string): Promise<void> {
  await requirePermission(actorId, PERMISSIONS.CONFIGURATION_MANAGE);
  await setSettingValue(key, value, actorId);
}

/**
 * The Programme Configuration screen's read model: Programme/Cohort
 * fields plus every date window — the Application Review Window (a real
 * `ReviewStage` row, Phase 3A) and the four `ProgrammeWindow` rows this
 * phase adds — assembled into one shape so the screen is one form, not
 * five.
 */
export async function getProgrammeConfiguration(actorId: string, programmeId: string): Promise<ProgrammeConfigViewModel> {
  await requirePermission(actorId, PERMISSIONS.CONFIGURATION_VIEW);

  const programme = await repo.getProgrammeWithActiveCohort(programmeId);
  if (!programme) throw new NotFoundError("That programme doesn't exist.");
  const cohort = programme.cohorts[0];
  if (!cohort) throw new NotFoundError("This programme has no active cohort configured.");

  const reviewStage = await repo.getActiveApplicationReviewStage(programmeId, cohort.id);

  const windows = Object.fromEntries(
    WINDOW_CODES.map((code) => {
      const row = programme.windows.find((w) => w.code === code && w.cohortId === cohort.id);
      return [code, { opensAt: row?.opensAt?.toISOString() ?? null, closesAt: row?.closesAt?.toISOString() ?? null }];
    }),
  ) as ProgrammeConfigViewModel["windows"];

  return {
    programmeId: programme.id,
    programmeName: programme.name,
    programmeCode: programme.code,
    cohortId: cohort.id,
    cohortName: cohort.name,
    cohortYear: cohort.year,
    applicationOpensAt: cohort.applicationOpensAt?.toISOString() ?? null,
    applicationClosesAt: cohort.applicationClosesAt?.toISOString() ?? null,
    applicationReviewWindow: reviewStage
      ? {
          reviewStageId: reviewStage.id,
          name: reviewStage.name,
          opensAt: reviewStage.opensAt?.toISOString() ?? null,
          closesAt: reviewStage.closesAt?.toISOString() ?? null,
        }
      : null,
    windows,
  };
}

export async function updateProgrammeDetails(actorId: string, programmeId: string, input: UpdateProgrammeInput): Promise<void> {
  const actor = await requirePermission(actorId, PERMISSIONS.CONFIGURATION_MANAGE);

  const before = await repo.getProgrammeWithActiveCohort(programmeId);
  if (!before) throw new NotFoundError("That programme doesn't exist.");

  await repo.updateProgramme(programmeId, { name: input.name, code: input.code });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.PROGRAMME_UPDATED,
    entityType: "Programme",
    entityId: programmeId,
    programmeId,
    metadata: { from: { name: before.name, code: before.code }, to: { name: input.name, code: input.code ?? null } },
  });
}

export async function updateCohortDetails(actorId: string, cohortId: string, programmeId: string, input: UpdateCohortInput): Promise<void> {
  const actor = await requirePermission(actorId, PERMISSIONS.CONFIGURATION_MANAGE);

  await repo.updateCohort(cohortId, {
    name: input.name,
    year: input.year,
    applicationOpensAt: input.applicationOpensAt ? new Date(input.applicationOpensAt) : null,
    applicationClosesAt: input.applicationClosesAt ? new Date(input.applicationClosesAt) : null,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.PROGRAMME_UPDATED,
    entityType: "Cohort",
    entityId: cohortId,
    programmeId,
    cohortId,
    metadata: { to: input },
  });
}

export async function updateProgrammeWindow(
  actorId: string,
  programmeId: string,
  cohortId: string,
  input: UpdateProgrammeWindowInput,
): Promise<void> {
  const actor = await requirePermission(actorId, PERMISSIONS.CONFIGURATION_MANAGE);

  await repo.upsertProgrammeWindow(programmeId, cohortId, input.code, {
    opensAt: input.opensAt ? new Date(input.opensAt) : null,
    closesAt: input.closesAt ? new Date(input.closesAt) : null,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.PROGRAMME_WINDOW_UPDATED,
    entityType: "ProgrammeWindow",
    entityId: `${programmeId}:${cohortId}:${input.code}`,
    programmeId,
    cohortId,
    metadata: { code: input.code, opensAt: input.opensAt ?? null, closesAt: input.closesAt ?? null },
  });
}

export async function updateApplicationReviewWindow(
  actorId: string,
  programmeId: string,
  cohortId: string,
  reviewStageId: string,
  input: UpdateApplicationReviewWindowInput,
): Promise<void> {
  const actor = await requirePermission(actorId, PERMISSIONS.CONFIGURATION_MANAGE);

  await repo.updateReviewStageWindow(reviewStageId, {
    opensAt: input.opensAt ? new Date(input.opensAt) : null,
    closesAt: input.closesAt ? new Date(input.closesAt) : null,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.REVIEW_STAGE_UPDATED,
    entityType: "ReviewStage",
    entityId: reviewStageId,
    programmeId,
    cohortId,
    metadata: { opensAt: input.opensAt ?? null, closesAt: input.closesAt ?? null },
  });
}
