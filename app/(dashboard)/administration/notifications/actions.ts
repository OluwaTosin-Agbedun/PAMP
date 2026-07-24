"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import {
  cancelNotification,
  resendNotification,
  retryNotification,
  sendTestEmail,
  updateTemplate,
} from "@/modules/notifications/services/notificationService";
import {
  cancelNotificationSchema,
  resendNotificationSchema,
  retryNotificationSchema,
  sendTestEmailSchema,
  updateTemplateSchema,
} from "@/modules/notifications/validation/schemas";

export type NotificationActionResult = { success: true } | { error: string };

function revalidate() {
  revalidatePath("/administration/notifications");
  revalidatePath("/administration/notifications/templates");
}

export async function retryNotificationAction(input: unknown): Promise<NotificationActionResult> {
  const session = await requireSession();
  try {
    const parsed = retryNotificationSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await retryNotification(session.user.id, parsed.data.id);
    revalidate();
    return { success: true };
  } catch (error) {
    return handleActionError(error, "notifications.retry");
  }
}

export async function cancelNotificationAction(input: unknown): Promise<NotificationActionResult> {
  const session = await requireSession();
  try {
    const parsed = cancelNotificationSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await cancelNotification(session.user.id, parsed.data.id);
    revalidate();
    return { success: true };
  } catch (error) {
    return handleActionError(error, "notifications.cancel");
  }
}

export async function resendNotificationAction(input: unknown): Promise<NotificationActionResult> {
  const session = await requireSession();
  try {
    const parsed = resendNotificationSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await resendNotification(session.user.id, parsed.data.id);
    revalidate();
    return { success: true };
  } catch (error) {
    return handleActionError(error, "notifications.resend");
  }
}

export async function updateTemplateAction(input: unknown): Promise<NotificationActionResult> {
  const session = await requireSession();
  try {
    const parsed = updateTemplateSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await updateTemplate(session.user.id, parsed.data);
    revalidate();
    return { success: true };
  } catch (error) {
    return handleActionError(error, "notifications.updateTemplate");
  }
}

export async function sendTestEmailAction(input: unknown): Promise<NotificationActionResult> {
  const session = await requireSession();
  try {
    const parsed = sendTestEmailSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await sendTestEmail(session.user.id, parsed.data.event, parsed.data.toEmail);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "notifications.sendTestEmail");
  }
}
