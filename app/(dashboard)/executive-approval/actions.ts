"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import { recordApprovalStageDecision } from "@/modules/executiveApproval/services/executiveApprovalService";
import { recordApprovalStageDecisionSchema } from "@/modules/executiveApproval/validation/schemas";

export type ExecutiveApprovalActionResult = { success: true } | { error: string };

export async function recordApprovalStageDecisionAction(input: unknown): Promise<ExecutiveApprovalActionResult> {
  const session = await requireSession();
  try {
    const parsed = recordApprovalStageDecisionSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await recordApprovalStageDecision(session.user.id, parsed.data);
    revalidatePath("/executive-approval");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "executiveApproval.recordDecision");
  }
}
