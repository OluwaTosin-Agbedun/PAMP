import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { FEATURE_FLAGS, isFeatureEnabled } from "@/lib/featureFlags/service";
import { logger } from "@/lib/logging/logger";
import { requireMailClient } from "@/lib/msgraph/mailClient";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";
import { getNumericSettingValue, getStringSettingValue } from "@/lib/settings/service";
import type { NotificationRecipientType, OutboundNotificationStatus } from "@/lib/generated/prisma/client";

import { canCancel, canRetry, isDue } from "../domain/outboundNotification";
import { extractPlaceholders, renderTemplate } from "../domain/templateRendering";
import { getNotificationEventDefinition, isKnownNotificationEvent, type NotificationEventKey } from "../eventCatalogue";
import * as repo from "../repositories/notificationRepository";
import type { NotificationListFiltersInput, UpdateTemplateInput } from "../validation/schemas";

/**
 * Notification Infrastructure — the one place that decides whether an
 * event actually becomes an email. Every enqueue records intent first,
 * unconditionally; whether a send is actually attempted is decided at
 * delivery time (`attemptDelivery`), never at enqueue time — so a
 * notification enqueued while the feature is disabled or Graph is
 * unconfigured is never silently lost, it's recorded as a clearly
 * explained `FAILED` row an administrator can retry once the gap is
 * fixed. See docs/NOTIFICATIONS.md.
 */

export type EnqueueNotificationInput = {
  event: NotificationEventKey;
  recipient:
    | { type: "APPLICANT"; applicantId: string; email: string | null | undefined }
    | { type: "USER"; userId: string; email: string | null | undefined };
  variables: Record<string, string>;
  internalComment?: string;
  applicantFacingComment?: string;
  scheduledFor?: Date;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Null for a system-triggered send (no human initiated it). */
  createdById?: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Always creates a row — never throws for "the feature is off" or "no
 * valid email," since neither of those is the caller's fault and both
 * should be visible on the delivery monitoring screen, not swallowed as
 * an exception the caller has to remember to catch. Deduplicates
 * against an existing live (not `FAILED`/`CANCELLED`) row for the same
 * (event, recipient, relatedEntity) — a second enqueue for the same
 * thing is a no-op, returning the existing row.
 */
export async function enqueueNotification(input: EnqueueNotificationInput) {
  if (!isKnownNotificationEvent(input.event)) {
    throw new ValidationError(`"${input.event}" isn't a recognised notification event.`);
  }
  const definition = getNotificationEventDefinition(input.event);
  const recipientType: NotificationRecipientType = input.recipient.type;

  const existing = await repo.findExistingLiveNotification({
    event: input.event,
    recipientType,
    applicantId: input.recipient.type === "APPLICANT" ? input.recipient.applicantId : null,
    userId: input.recipient.type === "USER" ? input.recipient.userId : null,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
  });
  if (existing) return existing;

  const template = await repo.getActiveTemplate(input.event);
  if (!template) {
    throw new ValidationError(`No active notification template is configured for "${definition.label}".`);
  }

  const email = input.recipient.email?.trim();
  const hasValidEmail = Boolean(email && EMAIL_PATTERN.test(email));

  const created = await repo.createOutboundNotification({
    event: input.event,
    recipientType,
    applicantId: input.recipient.type === "APPLICANT" ? input.recipient.applicantId : null,
    userId: input.recipient.type === "USER" ? input.recipient.userId : null,
    recipientEmail: email ?? "",
    templateId: template.id,
    variables: input.variables,
    internalComment: input.internalComment ?? null,
    applicantFacingComment: input.applicantFacingComment ?? null,
    status: hasValidEmail ? (input.scheduledFor ? "SCHEDULED" : "PENDING") : "FAILED",
    scheduledFor: input.scheduledFor ?? null,
    failureReason: hasValidEmail ? null : "No valid email address is on file for this recipient.",
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    createdById: input.createdById ?? null,
  });

  await writeAuditLog({
    actorId: input.createdById ?? null,
    action: AUDIT_ACTIONS.NOTIFICATION_ENQUEUED,
    entityType: "OutboundNotification",
    entityId: created.id,
    metadata: { event: input.event, recipientType, scheduled: Boolean(input.scheduledFor) },
  });

  // An immediate (non-scheduled), validly-addressed notification is
  // attempted right away rather than waiting for the next processor
  // tick — "Immediate notifications" per §5.3.
  if (hasValidEmail && !input.scheduledFor) {
    await attemptDelivery(created.id).catch((error) => {
      // attemptDelivery already persists the failure to the row itself
      // (never silent) — this catch exists only so a synchronous caller
      // (e.g. a screener marking Eligible) never fails *their own*
      // action because the notification attempt failed.
      logger.error("notifications.immediate_send_threw", { id: created.id, error: error instanceof Error ? error.message : String(error) });
    });
  }

  return repo.getOutboundNotificationById(created.id);
}

/** The actual send attempt for one row — used by the immediate path above and by `processDueNotifications`/manual retry below. */
async function attemptDelivery(id: string): Promise<void> {
  const row = await repo.getOutboundNotificationById(id);
  if (!row) return;

  await repo.markProcessing(id);

  if (!(await isFeatureEnabled(FEATURE_FLAGS.NOTIFICATIONS))) {
    await repo.markFailed(id, "Notifications are disabled (Administration → Feature Flags).", row.retryCount);
    await writeAuditLog({
      actorId: null,
      action: AUDIT_ACTIONS.NOTIFICATION_FAILED,
      entityType: "OutboundNotification",
      entityId: id,
      metadata: { event: row.event, reason: "feature_disabled" },
    });
    return;
  }

  let mailClient;
  try {
    mailClient = requireMailClient();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Microsoft Graph email delivery isn't configured.";
    await repo.markFailed(id, reason, row.retryCount);
    await writeAuditLog({
      actorId: null,
      action: AUDIT_ACTIONS.NOTIFICATION_FAILED,
      entityType: "OutboundNotification",
      entityId: id,
      metadata: { event: row.event, reason: "not_configured" },
    });
    return;
  }

  const rendered = renderTemplate(row.template, (row.variables as Record<string, string>) ?? {});
  const senderName = await getStringSettingValue("notification.sender_name");
  const replyAddress = await getStringSettingValue("notification.reply_address");

  try {
    const result = await mailClient.sendMail({
      toEmail: row.recipientEmail,
      subject: rendered.subject,
      body: rendered.body,
      senderName,
      replyToEmail: replyAddress || undefined,
    });
    await repo.markSent(id, result.providerMessageId);
    await writeAuditLog({
      actorId: null,
      action: AUDIT_ACTIONS.NOTIFICATION_SENT,
      entityType: "OutboundNotification",
      entityId: id,
      metadata: { event: row.event, recipientEmail: row.recipientEmail },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Couldn't send this notification.";
    const retryCount = row.retryCount + 1;
    const retryLimit = await getNumericSettingValue("notification.retry_limit");

    if (retryCount <= retryLimit) {
      // Exponential-ish backoff, capped, so a persistently-failing
      // notification doesn't hammer Graph every processor tick.
      const backoffMinutes = Math.min(60, 5 * 2 ** (retryCount - 1));
      await repo.markRetrying(id, new Date(Date.now() + backoffMinutes * 60_000));
      await prisma.outboundNotification.update({ where: { id }, data: { retryCount, failureReason: reason } });
    } else {
      await repo.markFailed(id, reason, retryCount);
    }

    await writeAuditLog({
      actorId: null,
      action: AUDIT_ACTIONS.NOTIFICATION_FAILED,
      entityType: "OutboundNotification",
      entityId: id,
      metadata: { event: row.event, reason, retryCount },
    });
  }
}

/** Called by the external scheduler endpoint — every due row gets one delivery attempt. */
export async function processDueNotifications(): Promise<{ processed: number }> {
  const due = await repo.listDueNotifications(new Date());
  for (const row of due) {
    if (!isDue({ status: row.status, scheduledFor: row.scheduledFor }, new Date())) continue;
    await attemptDelivery(row.id);
  }
  return { processed: due.length };
}

export async function retryNotification(actorId: string, id: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.NOTIFICATIONS_ADMINISTER);

  const row = await repo.getOutboundNotificationById(id);
  if (!row) throw new NotFoundError("That notification doesn't exist.");
  if (!canRetry(row.status)) {
    throw new ConflictError("Only a failed notification can be retried.");
  }

  await attemptDelivery(id);

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.NOTIFICATION_RETRIED,
    entityType: "OutboundNotification",
    entityId: id,
    metadata: { event: row.event },
  });

  return repo.getOutboundNotificationById(id);
}

export async function cancelNotification(actorId: string, id: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.NOTIFICATIONS_ADMINISTER);

  const row = await repo.getOutboundNotificationById(id);
  if (!row) throw new NotFoundError("That notification doesn't exist.");
  if (!canCancel(row.status)) {
    throw new ConflictError("Only a pending or scheduled notification can be cancelled.");
  }

  const updated = await repo.markCancelled(id, actor.id);

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.NOTIFICATION_CANCELLED,
    entityType: "OutboundNotification",
    entityId: id,
    metadata: { event: row.event },
  });

  return updated;
}

/** Creates a fresh row cloning the original's event/recipient/variables/comments and attempts delivery immediately — works from any status, not only Failed. */
export async function resendNotification(actorId: string, id: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.NOTIFICATIONS_ADMINISTER);

  const original = await repo.getOutboundNotificationById(id);
  if (!original) throw new NotFoundError("That notification doesn't exist.");

  const resent = await enqueueNotification({
    event: original.event as NotificationEventKey,
    recipient:
      original.recipientType === "APPLICANT"
        ? { type: "APPLICANT", applicantId: original.applicantId!, email: original.recipientEmail }
        : { type: "USER", userId: original.userId!, email: original.recipientEmail },
    variables: (original.variables as Record<string, string>) ?? {},
    internalComment: original.internalComment ?? undefined,
    applicantFacingComment: original.applicantFacingComment ?? undefined,
    relatedEntityType: original.relatedEntityType ?? undefined,
    relatedEntityId: `${original.relatedEntityId ?? original.id}:resend:${Date.now()}`,
    createdById: actor.id,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.NOTIFICATION_RESENT,
    entityType: "OutboundNotification",
    entityId: resent!.id,
    metadata: { event: original.event, originalId: original.id },
  });

  return resent;
}

export async function listNotifications(actorId: string, filters: NotificationListFiltersInput) {
  await requirePermission(actorId, PERMISSIONS.NOTIFICATIONS_ADMINISTER);
  return repo.listNotifications({ status: filters.status as OutboundNotificationStatus | undefined, event: filters.event, search: filters.search });
}

export async function listActiveTemplates(actorId: string) {
  await requirePermission(actorId, PERMISSIONS.NOTIFICATIONS_ADMINISTER);
  return repo.listActiveTemplates();
}

export async function updateTemplate(actorId: string, input: UpdateTemplateInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.NOTIFICATIONS_ADMINISTER);
  if (!isKnownNotificationEvent(input.event)) {
    throw new ValidationError(`"${input.event}" isn't a recognised notification event.`);
  }

  const definition = getNotificationEventDefinition(input.event);
  const used = extractPlaceholders({ subject: input.subject, body: input.body });
  const unknown = used.filter((name) => !definition.variables.includes(name));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown placeholder${unknown.length === 1 ? "" : "s"} for "${definition.label}": ${unknown.map((n) => `{{${n}}}`).join(", ")}.`);
  }

  const template = await repo.publishTemplateVersion(input.event, {
    subject: input.subject,
    body: input.body,
    updatedById: actor.id,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.NOTIFICATION_TEMPLATE_UPDATED,
    entityType: "NotificationTemplate",
    entityId: template.id,
    metadata: { event: input.event, version: template.version },
  });

  return template;
}

/** Sends immediately, bypassing the outbox entirely — an ad hoc admin utility, not a real recipient's message, so it isn't a persisted OutboundNotification row. */
export async function sendTestEmail(actorId: string, event: string, toEmail: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.NOTIFICATIONS_ADMINISTER);
  if (!isKnownNotificationEvent(event)) {
    throw new ValidationError(`"${event}" isn't a recognised notification event.`);
  }

  const template = await repo.getActiveTemplate(event);
  if (!template) throw new ValidationError("No active template is configured for this event.");

  const definition = getNotificationEventDefinition(event);
  const sampleVariables = Object.fromEntries(definition.variables.map((name) => [name, `[${name}]`]));
  const rendered = renderTemplate(template, sampleVariables);

  const mailClient = requireMailClient();
  const senderName = await getStringSettingValue("notification.sender_name");
  const replyAddress = await getStringSettingValue("notification.reply_address");

  await mailClient.sendMail({
    toEmail,
    subject: `[TEST] ${rendered.subject}`,
    body: rendered.body,
    senderName,
    replyToEmail: replyAddress || undefined,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.NOTIFICATION_TEST_SENT,
    entityType: "NotificationTemplate",
    entityId: template.id,
    metadata: { event, toEmail },
  });
}
