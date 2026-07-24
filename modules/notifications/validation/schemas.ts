import { z } from "zod";

export const updateTemplateSchema = z.object({
  event: z.string().min(1),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  body: z.string().trim().min(1, "Body is required").max(10_000),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const sendTestEmailSchema = z.object({
  event: z.string().min(1),
  toEmail: z.string().trim().email("Enter a valid email address"),
});
export type SendTestEmailInput = z.infer<typeof sendTestEmailSchema>;

export const cancelNotificationSchema = z.object({
  id: z.string().min(1),
});
export type CancelNotificationInput = z.infer<typeof cancelNotificationSchema>;

export const retryNotificationSchema = z.object({
  id: z.string().min(1),
});
export type RetryNotificationInput = z.infer<typeof retryNotificationSchema>;

export const resendNotificationSchema = z.object({
  id: z.string().min(1),
});
export type ResendNotificationInput = z.infer<typeof resendNotificationSchema>;

export const notificationListFiltersSchema = z.object({
  status: z.enum(["PENDING", "SCHEDULED", "PROCESSING", "SENT", "FAILED", "RETRYING", "CANCELLED"]).optional(),
  event: z.string().optional(),
  search: z.string().trim().optional(),
});
export type NotificationListFiltersInput = z.infer<typeof notificationListFiltersSchema>;
