"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import { saveDraftInterviewScores, submitInterviewScore } from "@/modules/interviews/services/interviewScoreService";
import {
  endInterviewSession,
  selectAdditionalQuestion,
  startInterviewSession,
} from "@/modules/interviews/services/interviewQuestionService";
import {
  saveDraftInterviewScoresSchema,
  selectAdditionalQuestionSchema,
  submitInterviewScoreSchema,
} from "@/modules/interviews/validation/schemas";

/**
 * Server Actions for the interview scoring form (Release 1 Module 2) —
 * deliberately thin, mirroring app/(dashboard)/reviews/[assignmentId]/
 * actions.ts: get the caller's own session id, delegate every real
 * check to interviewScoreService, translate its typed AppErrors into an
 * inline message. No redirect on save/submit failure — it surfaces next
 * to the form.
 */

export type InterviewScoringActionResult =
  | { success: true; breakdown: { criterionId: string; rawScore: string | null }[]; total: string }
  | { error: string };

function serializeBreakdown(
  breakdown: Awaited<ReturnType<typeof saveDraftInterviewScores>>,
): InterviewScoringActionResult {
  return {
    success: true,
    total: breakdown.total.toString(),
    breakdown: breakdown.criteria.map((c) => ({
      criterionId: c.criterionId,
      rawScore: c.rawScore ? c.rawScore.toString() : null,
    })),
  };
}

export async function saveDraftInterviewScoresAction(input: unknown): Promise<InterviewScoringActionResult> {
  const session = await requireSession();
  try {
    const parsed = saveDraftInterviewScoresSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    const breakdown = await saveDraftInterviewScores(session.user.id, parsed.data);
    return serializeBreakdown(breakdown);
  } catch (error) {
    return handleActionError(error, "interviews.saveDraft");
  }
}

export async function submitInterviewScoreAction(input: unknown): Promise<InterviewScoringActionResult> {
  const session = await requireSession();
  try {
    const parsed = submitInterviewScoreSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    const breakdown = await submitInterviewScore(session.user.id, parsed.data);
    revalidatePath("/interviews");
    return serializeBreakdown(breakdown);
  } catch (error) {
    return handleActionError(error, "interviews.submit");
  }
}

export type InterviewSessionActionResult = { success: true } | { error: string };

export async function startInterviewSessionAction(interviewId: string): Promise<InterviewSessionActionResult> {
  const session = await requireSession();
  try {
    await startInterviewSession(session.user.id, interviewId);
    revalidatePath(`/interviews/${interviewId}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.questions.startSession");
  }
}

export async function endInterviewSessionAction(interviewId: string): Promise<InterviewSessionActionResult> {
  const session = await requireSession();
  try {
    await endInterviewSession(session.user.id, interviewId);
    revalidatePath(`/interviews/${interviewId}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.questions.endSession");
  }
}

export async function selectAdditionalQuestionAction(input: unknown): Promise<InterviewSessionActionResult> {
  const session = await requireSession();
  try {
    const parsed = selectAdditionalQuestionSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await selectAdditionalQuestion(session.user.id, parsed.data);
    revalidatePath(`/interviews/${parsed.data.interviewId}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.questions.selectAdditional");
  }
}
