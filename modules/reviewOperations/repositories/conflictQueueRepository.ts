import "server-only";

import { prisma } from "@/lib/db/prisma";

export function listConflictsForCohort(cohortId: string) {
  return prisma.reviewConflictOfInterest.findMany({
    where: { application: { cohortId } },
    include: {
      reviewer: { select: { id: true, name: true } },
      declaredBy: { select: { id: true, name: true } },
      application: {
        select: { id: true, pathway: true, applicant: { select: { firstName: true, lastName: true, externalRef: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Reviews with a post-assignment recusal (`status: "RECUSED"`) — the
 * schema and lifecycle already support this (Phase 3A), though no
 * mutation in this codebase currently sets it; included for completeness
 * so the queue is honest about what recusal state exists, not because a
 * recusal-triggering action ships this phase. See
 * docs/REVIEW_MONITORING_AND_ESCALATION.md.
 */
export function listRecusedReviewsForCohort(cohortId: string) {
  return prisma.review.findMany({
    where: { status: "RECUSED", reviewAssignment: { application: { cohortId } } },
    include: {
      reviewer: { select: { id: true, name: true } },
      application: {
        select: { id: true, pathway: true, applicant: { select: { firstName: true, lastName: true, externalRef: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}
