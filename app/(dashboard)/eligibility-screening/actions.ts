"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import {
  assignScreener,
  escalate,
  extendClarificationDeadline,
  markDisqualified,
  markEligible,
  markIneligible,
  performSecondReview,
  reopenScreening,
  requestClarification,
  resolveClarification,
  resolveDuplicate,
  runAutomaticEligibilityForCohort,
  updateChecklistItem,
} from "@/modules/eligibility/screeningService";
import { autoAssignRandomReviewersForCohort } from "@/modules/eligibility/reviewerAssignment";
import {
  assignScreenerSchema,
  escalateSchema,
  extendClarificationDeadlineSchema,
  markDisqualifiedSchema,
  markEligibleSchema,
  markIneligibleSchema,
  reopenScreeningSchema,
  requestClarificationSchema,
  resolveDuplicateSchema,
  secondReviewSchema,
  updateChecklistItemSchema,
} from "@/modules/eligibility/screeningValidation";

export type ScreeningActionResult = { success: true } | { error: string };

function revalidate(applicationId: string) {
  revalidatePath(`/eligibility-screening/${applicationId}`);
  revalidatePath("/eligibility-screening");
  revalidatePath(`/applicants/${applicationId}`);
}

function action<Input>(
  schema: { safeParse: (input: unknown) => { success: boolean; data?: Input; error?: { issues: { message?: string }[] } } },
  handler: (actorId: string, input: Input) => Promise<unknown>,
  operation: string,
) {
  return async (input: unknown): Promise<ScreeningActionResult> => {
    const session = await requireSession();
    try {
      const parsed = schema.safeParse(input);
      if (!parsed.success || !parsed.data) return { error: parsed.error?.issues[0]?.message ?? "Invalid input." };
      await handler(session.user.id, parsed.data);
      const applicationId = (parsed.data as { applicationId?: string }).applicationId;
      if (applicationId) revalidate(applicationId);
      return { success: true };
    } catch (error) {
      return handleActionError(error, operation);
    }
  };
}

export const assignScreenerAction = action(assignScreenerSchema, assignScreener, "eligibility.assignScreener");
export const updateChecklistItemAction = action(updateChecklistItemSchema, updateChecklistItem, "eligibility.updateChecklistItem");
export const markEligibleAction = action(markEligibleSchema, markEligible, "eligibility.markEligible");
export const requestClarificationAction = action(requestClarificationSchema, requestClarification, "eligibility.requestClarification");
export const markIneligibleAction = action(markIneligibleSchema, markIneligible, "eligibility.markIneligible");
export const escalateAction = action(escalateSchema, escalate, "eligibility.escalate");
export const markDisqualifiedAction = action(markDisqualifiedSchema, markDisqualified, "eligibility.markDisqualified");
export const performSecondReviewAction = action(secondReviewSchema, performSecondReview, "eligibility.secondReview");
export const reopenScreeningAction = action(reopenScreeningSchema, reopenScreening, "eligibility.reopen");
export const extendClarificationDeadlineAction = action(
  extendClarificationDeadlineSchema,
  extendClarificationDeadline,
  "eligibility.extendClarificationDeadline",
);
export const resolveDuplicateAction = action(resolveDuplicateSchema, resolveDuplicate, "eligibility.resolveDuplicate");

export async function resolveClarificationAction(applicationId: string): Promise<ScreeningActionResult> {
  const session = await requireSession();
  try {
    await resolveClarification(session.user.id, applicationId);
    revalidate(applicationId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "eligibility.resolveClarification");
  }
}

export type RunAutomaticEligibilityResult = { success: true; processed: number; outcomes: Record<string, number> } | { error: string };

/** For applications imported before the automatic engine existed, or otherwise still awaiting a confirmed decision. */
export async function runAutomaticEligibilityForCohortAction(cohortId: string): Promise<RunAutomaticEligibilityResult> {
  const session = await requireSession();
  try {
    const result = await runAutomaticEligibilityForCohort(session.user.id, cohortId);
    revalidatePath("/eligibility-screening");
    revalidatePath("/applicants");
    return { success: true, ...result };
  } catch (error) {
    return handleActionError(error, "eligibility.runAutomaticForCohort");
  }
}

export type RandomAssignReviewersResult =
  | { success: true; processed: number; assigned: number; distribution: Record<string, number> }
  | { error: string };

/** On-demand backfill for screenings still awaiting a human that have no reviewer yet — the automatic decision engine assigns one the moment a case is flagged, this is for stragglers (applications imported before this existed, or left over from a pool change). */
export async function randomlyAssignReviewersForCohortAction(cohortId: string): Promise<RandomAssignReviewersResult> {
  const session = await requireSession();
  try {
    const result = await autoAssignRandomReviewersForCohort(session.user.id, cohortId);
    revalidatePath("/eligibility-screening");
    revalidatePath("/applicants");
    return { success: true, ...result };
  } catch (error) {
    return handleActionError(error, "eligibility.randomlyAssignReviewersForCohort");
  }
}
