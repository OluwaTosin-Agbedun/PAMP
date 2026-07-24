import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Pure data access for InterviewTeamsMeeting — no Graph calls, no permission checks, no audit writes; that's all teamsMeetingService.ts. */

export function getByInterviewId(interviewId: string) {
  return prisma.interviewTeamsMeeting.findUnique({ where: { interviewId } });
}

/** Creates the row on first sync attempt for an interview — every later
 *  call updates this same row (never a second one per interview). */
export function ensureMeetingRow(interviewId: string, createdById: string) {
  return prisma.interviewTeamsMeeting.upsert({
    where: { interviewId },
    update: {},
    create: { interviewId, createdById, syncStatus: "PENDING" },
  });
}

export function recordAttempt(id: string) {
  return prisma.interviewTeamsMeeting.update({
    where: { id },
    data: { lastAttemptedAt: new Date() },
  });
}

export function recordSuccess(
  id: string,
  data: { graphEventId: string; joinUrl: string; organiserUpn: string | null },
) {
  return prisma.interviewTeamsMeeting.update({
    where: { id },
    data: {
      graphEventId: data.graphEventId,
      joinUrl: data.joinUrl,
      organiserUpn: data.organiserUpn,
      syncStatus: "SYNCED",
      lastSyncedAt: new Date(),
      failureReason: null,
    },
  });
}

export function recordFailure(id: string, failureReason: string) {
  return prisma.interviewTeamsMeeting.update({
    where: { id },
    data: {
      syncStatus: "FAILED",
      failureReason,
      retryCount: { increment: 1 },
    },
  });
}

export function recordCancellation(id: string, cancelledById: string) {
  return prisma.interviewTeamsMeeting.update({
    where: { id },
    data: { syncStatus: "CANCELLED", cancelledAt: new Date(), cancelledById },
  });
}

export function cancelInterview(
  tx: Prisma.TransactionClient | typeof prisma,
  interviewId: string,
  data: { cancelledById: string; cancellationReason: string },
) {
  return tx.interview.update({
    where: { id: interviewId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: data.cancelledById,
      cancellationReason: data.cancellationReason,
    },
  });
}

export function rescheduleInterview(tx: Prisma.TransactionClient | typeof prisma, interviewId: string, scheduledAt: Date) {
  return tx.interview.update({ where: { id: interviewId }, data: { scheduledAt } });
}
