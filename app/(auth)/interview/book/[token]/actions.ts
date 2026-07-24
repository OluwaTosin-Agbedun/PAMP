"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { bookSlot } from "@/modules/interviews/services/schedulingService";
import { bookSlotSchema } from "@/modules/interviews/validation/schemas";

/**
 * Public, unauthenticated Server Action — the caller is identified
 * entirely by the booking token (ADR-0017), never a session. No
 * `requireSession`/`requirePermission` call here: this route is
 * deliberately outside the RBAC model, scoped to exactly one
 * interview's booking flow by the token itself.
 */
export type BookSlotActionResult = { success: true } | { error: string };

export async function bookSlotAction(input: unknown): Promise<BookSlotActionResult> {
  try {
    const parsed = bookSlotSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await bookSlot(parsed.data.token, parsed.data.slotId);
    revalidatePath(`/interview/book/${parsed.data.token}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interview.book");
  }
}
