"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import { saveDraftScores, submitReview } from "@/modules/reviews/services/reviewService";
import { saveDraftScoresSchema, submitReviewSchema } from "@/modules/reviews/validation/schemas";

/**
 * Server Actions for the scoring form (Phase 3C) — deliberately thin:
 * get the caller's own session id (cheap, JWT-based — the same
 * `requireSession` used elsewhere for this exact purpose), then delegate
 * every real authorization/ownership/business-rule check to
 * `reviewService`, which already throws typed `AppError`s for
 * `handleActionError` to translate into an inline message. No redirect
 * here — an autosave or submit failure should surface as a message next
 * to the form, not a full navigation, per docs/RBAC.md's guidance on
 * when to use `requirePermission` + `handleActionError` over a guard.
 */

export type ScoringActionResult =
  | { success: true; breakdown: { criterionId: string; rawScore: string | null; comment: string | null }[]; total: string }
  | { error: string };

function serializeBreakdown(breakdown: Awaited<ReturnType<typeof saveDraftScores>>): ScoringActionResult {
  return {
    success: true,
    total: breakdown.total.toString(),
    breakdown: breakdown.criteria.map((c) => ({
      criterionId: c.criterionId,
      rawScore: c.rawScore ? c.rawScore.toString() : null,
      comment: c.comment,
    })),
  };
}

export async function saveDraftScoresAction(input: unknown): Promise<ScoringActionResult> {
  const session = await requireSession();
  try {
    const parsed = saveDraftScoresSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    const breakdown = await saveDraftScores(session.user.id, parsed.data);
    return serializeBreakdown(breakdown);
  } catch (error) {
    return handleActionError(error, "reviews.saveDraft");
  }
}

export async function submitReviewAction(input: unknown): Promise<ScoringActionResult> {
  const session = await requireSession();
  try {
    const parsed = submitReviewSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    const breakdown = await submitReview(session.user.id, parsed.data);
    revalidatePath("/reviews");
    return serializeBreakdown(breakdown);
  } catch (error) {
    return handleActionError(error, "reviews.submit");
  }
}
