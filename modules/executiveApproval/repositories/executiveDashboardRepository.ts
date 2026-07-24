import "server-only";

import { prisma } from "@/lib/db/prisma";

export async function countTotalApplications(cohortId: string): Promise<number> {
  return prisma.application.count({ where: { cohortId } });
}

export type EligibilityCounts = { eligible: number; ineligible: number; pending: number; clarificationRequired: number; disqualified: number };

export async function countApplicationsByEligibilityStatus(cohortId: string): Promise<EligibilityCounts> {
  const rows = await prisma.application.groupBy({ by: ["eligibilityStatus"], where: { cohortId }, _count: { _all: true } });
  const byStatus = Object.fromEntries(rows.map((row) => [row.eligibilityStatus, row._count._all]));
  return {
    eligible: byStatus.ELIGIBLE ?? 0,
    ineligible: byStatus.INELIGIBLE ?? 0,
    pending: byStatus.PENDING ?? 0,
    clarificationRequired: byStatus.CLARIFICATION_REQUIRED ?? 0,
    disqualified: byStatus.DISQUALIFIED ?? 0,
  };
}

export type InterviewCounts = { scheduled: number; completed: number; cancelled: number; noShow: number };

export async function countInterviewsByStatus(cohortId: string): Promise<InterviewCounts> {
  const rows = await prisma.interview.groupBy({ by: ["status"], where: { cohortId }, _count: { _all: true } });
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
  return {
    scheduled: byStatus.SCHEDULED ?? 0,
    completed: byStatus.COMPLETED ?? 0,
    cancelled: byStatus.CANCELLED ?? 0,
    noShow: byStatus.NO_SHOW ?? 0,
  };
}
