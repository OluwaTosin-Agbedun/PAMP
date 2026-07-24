import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AvailabilityType, InterviewBookingStatus, InterviewSlotStatus, Prisma } from "@/lib/generated/prisma/client";

/**
 * Pure data access for InterviewerAvailability/InterviewSlot and the
 * scheduling-related fields on Interview — no business rules, no
 * permission checks, no audit writes; that's all services/schedulingService.ts.
 */

export function listAvailability(interviewerId: string, cohortId: string) {
  return prisma.interviewerAvailability.findMany({
    where: { interviewerId, cohortId },
    orderBy: { startsAt: "asc" },
  });
}

export function createAvailability(data: {
  interviewerId: string;
  cohortId: string;
  type: AvailabilityType;
  startsAt: Date;
  endsAt: Date;
  reason?: string | null;
}) {
  return prisma.interviewerAvailability.create({ data });
}

export function deleteAvailability(id: string, interviewerId: string) {
  return prisma.interviewerAvailability.deleteMany({ where: { id, interviewerId } });
}

/** Every availability row for a set of panellists in a cohort — the raw input to slot generation. */
export function listAvailabilityForInterviewers(interviewerIds: string[], cohortId: string) {
  return prisma.interviewerAvailability.findMany({
    where: { interviewerId: { in: interviewerIds }, cohortId },
  });
}

export function getInterviewForScheduling(interviewId: string) {
  return prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      application: { include: { applicant: true } },
      panelists: { where: { status: "ASSIGNED" }, include: { user: { select: { id: true, name: true, email: true } } } },
      candidateSlots: { orderBy: { startsAt: "asc" } },
      selectedSlot: true,
      teamsMeeting: { select: { joinUrl: true, syncStatus: true } },
    },
  });
}

/** Replaces every OPEN candidate slot for an interview — regeneration is idempotent. */
export async function replaceCandidateSlots(interviewId: string, slots: { startsAt: Date; endsAt: Date }[]) {
  await prisma.interviewSlot.deleteMany({ where: { interviewId, status: "OPEN" } });
  if (slots.length > 0) {
    await prisma.interviewSlot.createMany({
      data: slots.map((s) => ({ interviewId, startsAt: s.startsAt, endsAt: s.endsAt })),
    });
  }
}

export function getSlot(id: string) {
  return prisma.interviewSlot.findUnique({ where: { id } });
}

export function updateSlotStatus(tx: Prisma.TransactionClient | typeof prisma, id: string, status: InterviewSlotStatus) {
  return tx.interviewSlot.update({ where: { id }, data: { status } });
}

/** Confirmed interviews' calendar dates within a cohort — the input to the daily-capacity check. */
export async function countConfirmedInterviewsByDate(cohortId: string): Promise<Map<string, number>> {
  const confirmed = await prisma.interview.findMany({
    where: { cohortId, bookingStatus: "CONFIRMED", scheduledAt: { not: null } },
    select: { scheduledAt: true },
  });
  const counts = new Map<string, number>();
  for (const row of confirmed) {
    if (!row.scheduledAt) continue;
    const key = row.scheduledAt.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function updateInterviewScheduling(
  tx: Prisma.TransactionClient | typeof prisma,
  interviewId: string,
  data: Prisma.InterviewUncheckedUpdateInput,
) {
  return tx.interview.update({ where: { id: interviewId }, data });
}

export function updateBookingStatus(
  tx: Prisma.TransactionClient | typeof prisma,
  interviewId: string,
  fromStatus: InterviewBookingStatus,
  data: Prisma.InterviewUncheckedUpdateManyInput,
) {
  return tx.interview.updateMany({ where: { id: interviewId, bookingStatus: fromStatus }, data });
}

export function getInterviewByBookingTokenHash(tokenHash: string) {
  return prisma.interview.findUnique({
    where: { bookingTokenHash: tokenHash },
    include: {
      application: { include: { applicant: true } },
      candidateSlots: { where: { status: "OPEN" }, orderBy: { startsAt: "asc" } },
    },
  });
}
