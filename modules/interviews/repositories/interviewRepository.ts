import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { InterviewStatus, Prisma } from "@/lib/generated/prisma/client";

export function createInterview(data: {
  applicationId: string;
  cohortId: string;
  scheduledAt: Date;
  durationMinutes?: number;
  meetingLink?: string | null;
}) {
  return prisma.interview.create({ data });
}

export function getInterview(id: string) {
  return prisma.interview.findUnique({
    where: { id },
    include: {
      application: { include: { applicant: true } },
      panelists: { include: { user: { select: { id: true, name: true, email: true } } } },
      scores: true,
    },
  });
}

export function getInterviewForApplication(applicationId: string) {
  return prisma.interview.findFirst({ where: { applicationId }, orderBy: { scheduledAt: "desc" } });
}

export type InterviewSummaryCounts = {
  total: number;
  scheduled: number;
  completed: number;
  cancelledOrNoShow: number;
  awaitingBooking: number;
};

/** Cohort-wide counts for the Dashboard's "at a glance" overview — mirrors modules/applicants/repository.ts's getApplicantSummaryCounts. */
export async function getInterviewSummaryCounts(cohortId: string): Promise<InterviewSummaryCounts> {
  const [byStatus, awaitingBooking] = await Promise.all([
    prisma.interview.groupBy({ by: ["status"], where: { cohortId }, _count: { _all: true } }),
    prisma.interview.count({
      where: { cohortId, bookingStatus: { in: ["AWAITING_SLOTS", "SLOTS_PUBLISHED", "PENDING_CONFIRMATION"] } },
    }),
  ]);

  const countByStatus = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]));
  return {
    total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
    scheduled: countByStatus.SCHEDULED ?? 0,
    completed: countByStatus.COMPLETED ?? 0,
    cancelledOrNoShow: (countByStatus.CANCELLED ?? 0) + (countByStatus.NO_SHOW ?? 0),
    awaitingBooking,
  };
}

export function listInterviewsForCohort(cohortId: string, status?: InterviewStatus) {
  return prisma.interview.findMany({
    where: { cohortId, ...(status ? { status } : {}) },
    include: {
      application: { include: { applicant: true } },
      panelists: { include: { user: { select: { id: true, name: true } } } },
      scores: { select: { panelistId: true, status: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

export function updateInterview(
  id: string,
  data: { scheduledAt?: Date; durationMinutes?: number; meetingLink?: string | null; status?: InterviewStatus },
) {
  return prisma.interview.update({ where: { id }, data });
}

export function getInterviewForOverride(interviewId: string) {
  return prisma.interview.findUnique({ where: { id: interviewId } });
}

/**
 * Status-conditioned: only succeeds if `scoringOverrideAt` is still null —
 * same optimistic-concurrency pattern as `updateScoreStatus`/
 * `updatePanelistStatus`. Caller checks `.count === 0` and throws.
 */
export function applyScoringOverride(
  interviewId: string,
  data: {
    scoringOverrideAt: Date;
    scoringOverrideById: string;
    scoringOverrideReason: string;
    scoringOverrideMissingPanelistId: string;
  },
) {
  return prisma.interview.updateMany({
    where: { id: interviewId, scoringOverrideAt: null },
    data,
  });
}

/** Status-conditioned: only succeeds if the session hasn't already started. */
export function applyActualStart(
  tx: Prisma.TransactionClient | typeof prisma,
  interviewId: string,
  data: { actualStartedAt: Date; actualStartedById: string },
) {
  return tx.interview.updateMany({
    where: { id: interviewId, actualStartedAt: null },
    data,
  });
}

/** Status-conditioned: only succeeds if the session has started and hasn't already ended. */
export function applyActualEnd(
  interviewId: string,
  data: { actualEndedAt: Date; actualEndedById: string },
) {
  return prisma.interview.updateMany({
    where: { id: interviewId, actualStartedAt: { not: null }, actualEndedAt: null },
    data,
  });
}
