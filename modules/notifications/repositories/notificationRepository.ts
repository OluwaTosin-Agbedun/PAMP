import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { NotificationRecipientType, OutboundNotificationStatus, Prisma } from "@/lib/generated/prisma/client";

const OUTBOUND_INCLUDE = {
  template: true,
  applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
  user: { select: { id: true, name: true, email: true } },
  cancelledBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.OutboundNotificationInclude;

export function getActiveTemplate(event: string) {
  return prisma.notificationTemplate.findFirst({ where: { event, isActive: true }, orderBy: { version: "desc" } });
}

export function listTemplatesForEvent(event: string) {
  return prisma.notificationTemplate.findMany({ where: { event }, orderBy: { version: "desc" } });
}

export function listActiveTemplates() {
  return prisma.notificationTemplate.findMany({ where: { isActive: true }, orderBy: { event: "asc" } });
}

/**
 * Publishing a new version deactivates every prior version for the same
 * event in the same transaction — `(event, version)` stays unique and
 * exactly one row per event is ever `isActive: true`, so
 * `getActiveTemplate` never has to pick among ties.
 */
export async function publishTemplateVersion(
  event: string,
  data: { subject: string; body: string; updatedById: string },
) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.notificationTemplate.findFirst({ where: { event }, orderBy: { version: "desc" } });
    const nextVersion = (latest?.version ?? 0) + 1;
    await tx.notificationTemplate.updateMany({ where: { event, isActive: true }, data: { isActive: false } });
    return tx.notificationTemplate.create({
      data: {
        event,
        version: nextVersion,
        subject: data.subject,
        body: data.body,
        isActive: true,
        updatedById: data.updatedById,
      },
    });
  });
}

export function findExistingLiveNotification(params: {
  event: string;
  recipientType: NotificationRecipientType;
  applicantId?: string | null;
  userId?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}) {
  return prisma.outboundNotification.findFirst({
    where: {
      event: params.event,
      recipientType: params.recipientType,
      applicantId: params.applicantId ?? undefined,
      userId: params.userId ?? undefined,
      relatedEntityType: params.relatedEntityType ?? undefined,
      relatedEntityId: params.relatedEntityId ?? undefined,
      status: { notIn: ["FAILED", "CANCELLED"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function createOutboundNotification(data: Prisma.OutboundNotificationUncheckedCreateInput) {
  return prisma.outboundNotification.create({ data, include: OUTBOUND_INCLUDE });
}

export function getOutboundNotificationById(id: string) {
  return prisma.outboundNotification.findUnique({ where: { id }, include: OUTBOUND_INCLUDE });
}

export function listDueNotifications(asOf: Date, limit = 50) {
  return prisma.outboundNotification.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: { in: ["SCHEDULED", "RETRYING"] }, scheduledFor: { lte: asOf } },
      ],
    },
    include: OUTBOUND_INCLUDE,
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export function listNotifications(filters: {
  status?: OutboundNotificationStatus;
  event?: string;
  search?: string;
}) {
  return prisma.outboundNotification.findMany({
    where: {
      status: filters.status,
      event: filters.event,
      ...(filters.search
        ? {
            OR: [
              { recipientEmail: { contains: filters.search, mode: "insensitive" } },
              { applicant: { firstName: { contains: filters.search, mode: "insensitive" } } },
              { applicant: { lastName: { contains: filters.search, mode: "insensitive" } } },
              { user: { name: { contains: filters.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: OUTBOUND_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export function markProcessing(id: string) {
  return prisma.outboundNotification.update({ where: { id }, data: { status: "PROCESSING" } });
}

export function markSent(id: string, providerMessageId: string | null) {
  return prisma.outboundNotification.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), providerMessageId, failureReason: null },
  });
}

export function markFailed(id: string, failureReason: string, retryCount: number) {
  return prisma.outboundNotification.update({
    where: { id },
    data: { status: "FAILED", failureReason, retryCount },
  });
}

export function markRetrying(id: string, scheduledFor: Date) {
  return prisma.outboundNotification.update({
    where: { id },
    data: { status: "RETRYING", scheduledFor, failureReason: null },
  });
}

export function markCancelled(id: string, cancelledById: string) {
  return prisma.outboundNotification.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById },
  });
}
