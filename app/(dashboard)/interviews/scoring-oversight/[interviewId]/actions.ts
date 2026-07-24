"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import { closeInterviewWithOverride } from "@/modules/interviews/services/interviewScoreService";
import { closeInterviewWithOverrideSchema } from "@/modules/interviews/validation/schemas";

/**
 * Server Action for the Secretariat's "Close Interview with Three Valid
 * Scores" override (Addendum §2.6) — same thin-delegate shape as
 * app/(dashboard)/interviews/[interviewId]/actions.ts: get the caller's
 * own session id, delegate every real check to interviewScoreService,
 * translate its typed AppErrors into an inline message.
 */
export async function closeInterviewWithOverrideAction(input: unknown): Promise<{ success: true } | { error: string }> {
  const session = await requireSession();
  try {
    const parsed = closeInterviewWithOverrideSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await closeInterviewWithOverride(session.user.id, parsed.data);
    revalidatePath(`/interviews/scoring-oversight/${parsed.data.interviewId}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scoringOversight.closeWithOverride");
  }
}
