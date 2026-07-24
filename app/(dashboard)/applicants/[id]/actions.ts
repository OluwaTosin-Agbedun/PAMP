"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import { deleteApplicant } from "@/modules/applicants/service";
import * as recommendationService from "@/modules/eligibilityQa/services/recommendationService";
import { createRecommendationSchema, resolveRecommendationSchema } from "@/modules/eligibilityQa/validation/schemas";

export type EligibilityQaActionResult = { success: true } | { error: string };

export type DeleteApplicantActionResult = { success: true } | { error: string };

export async function deleteApplicantAction(applicationId: string, reason: string): Promise<DeleteApplicantActionResult> {
  const session = await requireSession();
  try {
    if (reason.trim().length < 5) {
      return { error: "Please provide a reason (at least 5 characters)." };
    }
    await deleteApplicant(session.user.id, applicationId, reason.trim());
    revalidatePath("/applicants");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "applicants.delete");
  }
}

export async function createEligibilityRecommendationAction(applicationId: string, input: unknown): Promise<EligibilityQaActionResult> {
  const session = await requireSession();
  try {
    const parsed = createRecommendationSchema.safeParse({ ...(input as object), applicationId });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await recommendationService.createRecommendation(session.user.id, parsed.data);
    revalidatePath(`/applicants/${applicationId}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "eligibilityQa.createRecommendation");
  }
}

export async function executeEligibilityOverrideAction(applicationId: string, input: unknown): Promise<EligibilityQaActionResult> {
  const session = await requireSession();
  try {
    const parsed = resolveRecommendationSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await recommendationService.executeOverride(session.user.id, parsed.data.recommendationId, parsed.data.executionNote);
    revalidatePath(`/applicants/${applicationId}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "eligibilityQa.executeOverride");
  }
}

export async function dismissEligibilityRecommendationAction(applicationId: string, input: unknown): Promise<EligibilityQaActionResult> {
  const session = await requireSession();
  try {
    const parsed = resolveRecommendationSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await recommendationService.dismissRecommendation(session.user.id, parsed.data.recommendationId, parsed.data.executionNote);
    revalidatePath(`/applicants/${applicationId}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "eligibilityQa.dismissRecommendation");
  }
}
