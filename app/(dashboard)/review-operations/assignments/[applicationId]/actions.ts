"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import { declareConflictOfInterest, reassignAssignment } from "@/modules/reviews/services/assignmentService";
import {
  declareConflictOfInterestSchema,
  reassignAssignmentSchema,
} from "@/modules/reviews/validation/assignmentSchemas";
import { createAdministrativeNote } from "@/modules/notes/service";
import { createAdministrativeNoteSchema } from "@/modules/reviewOperations/validation/schemas";

export type OperationsActionResult = { success: true } | { error: string };

/**
 * Thin Server Actions for the Secretariat's application detail screen —
 * every one delegates its actual rule enforcement to the Phase 3B
 * assignment engine or Phase 3D's notes service, which already validate,
 * transact, and audit. Nothing here re-implements eligibility, capacity,
 * or conflict checks (§"Use the Phase 3B reassignment engine").
 */

export async function reassignAssignmentAction(applicationId: string, input: unknown): Promise<OperationsActionResult> {
  const session = await requireSession();
  try {
    const parsed = reassignAssignmentSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await reassignAssignment(session.user.id, parsed.data);
    revalidatePath(`/review-operations/assignments/${applicationId}`);
    revalidatePath("/review-operations/assignments");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "reviewOperations.reassign");
  }
}

export async function declareConflictAction(applicationId: string, input: unknown): Promise<OperationsActionResult> {
  const session = await requireSession();
  try {
    const parsed = declareConflictOfInterestSchema.safeParse({ ...(input as object), applicationId });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await declareConflictOfInterest(session.user.id, parsed.data);
    revalidatePath(`/review-operations/assignments/${applicationId}`);
    revalidatePath("/review-operations/conflicts");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "reviewOperations.declareConflict");
  }
}

export async function createAdministrativeNoteAction(applicationId: string, input: unknown): Promise<OperationsActionResult> {
  const session = await requireSession();
  try {
    const parsed = createAdministrativeNoteSchema.safeParse({ ...(input as object), applicationId });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await createAdministrativeNote(session.user.id, parsed.data.applicationId, parsed.data.body);
    revalidatePath(`/review-operations/assignments/${applicationId}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "reviewOperations.createNote");
  }
}
