"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import * as configurationService from "@/modules/configuration/services/configurationService";
import {
  updateApplicationReviewWindowSchema,
  updateCohortSchema,
  updateProgrammeSchema,
  updateProgrammeWindowSchema,
  updateSettingSchema,
} from "@/modules/configuration/validation/schemas";

export type ConfigActionResult = { success: true } | { error: string };

export async function updateSettingAction(key: string, value: number | boolean | string): Promise<ConfigActionResult> {
  const session = await requireSession();
  try {
    const parsed = updateSettingSchema.safeParse({ key, value });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await configurationService.updateSetting(session.user.id, parsed.data.key, parsed.data.value);
    revalidatePath("/administration/configuration", "layout");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "configuration.updateSetting");
  }
}

export async function updateProgrammeAction(programmeId: string, input: unknown): Promise<ConfigActionResult> {
  const session = await requireSession();
  try {
    const parsed = updateProgrammeSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await configurationService.updateProgrammeDetails(session.user.id, programmeId, parsed.data);
    revalidatePath("/administration/configuration/programme");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "configuration.updateProgramme");
  }
}

export async function updateCohortAction(cohortId: string, programmeId: string, input: unknown): Promise<ConfigActionResult> {
  const session = await requireSession();
  try {
    const parsed = updateCohortSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await configurationService.updateCohortDetails(session.user.id, cohortId, programmeId, parsed.data);
    revalidatePath("/administration/configuration/programme");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "configuration.updateCohort");
  }
}

export async function updateProgrammeWindowAction(programmeId: string, cohortId: string, input: unknown): Promise<ConfigActionResult> {
  const session = await requireSession();
  try {
    const parsed = updateProgrammeWindowSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await configurationService.updateProgrammeWindow(session.user.id, programmeId, cohortId, parsed.data);
    revalidatePath("/administration/configuration/programme");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "configuration.updateProgrammeWindow");
  }
}

export async function updateApplicationReviewWindowAction(
  programmeId: string,
  cohortId: string,
  reviewStageId: string,
  input: unknown,
): Promise<ConfigActionResult> {
  const session = await requireSession();
  try {
    const parsed = updateApplicationReviewWindowSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await configurationService.updateApplicationReviewWindow(session.user.id, programmeId, cohortId, reviewStageId, parsed.data);
    revalidatePath("/administration/configuration/programme");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "configuration.updateApplicationReviewWindow");
  }
}
