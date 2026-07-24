"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import { removeAvailability, submitAvailability } from "@/modules/interviews/services/schedulingService";
import { submitAvailabilitySchema } from "@/modules/interviews/validation/schemas";

export type AvailabilityActionResult = { success: true } | { error: string };

export async function submitAvailabilityAction(input: unknown): Promise<AvailabilityActionResult> {
  const session = await requireSession();
  try {
    const parsed = submitAvailabilitySchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await submitAvailability(session.user.id, parsed.data);
    revalidatePath("/interviews/availability");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.availability.submit");
  }
}

export async function removeAvailabilityAction(id: string): Promise<AvailabilityActionResult> {
  const session = await requireSession();
  try {
    await removeAvailability(session.user.id, id);
    revalidatePath("/interviews/availability");
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.availability.remove");
  }
}
