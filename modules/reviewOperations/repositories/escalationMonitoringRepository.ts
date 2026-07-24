import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Third-review monitoring read model (Phase 3D §"THIRD-REVIEW
 * MONITORING"). Every figure here — `scoreDifference`, `thresholdApplied`,
 * `resolvedFinalScore` — is read directly off the `ReviewEscalation` row
 * Phase 3B's engine already computed and stored; nothing is recalculated
 * here. See docs/adr/ADR-review-operations-read-model.md.
 */

const ESCALATION_INCLUDE = {
  application: {
    select: {
      id: true,
      pathway: true,
      applicant: { select: { firstName: true, lastName: true, externalRef: true } },
    },
  },
  firstReview: { select: { id: true, totalScore: true, reviewerId: true, reviewer: { select: { name: true } } } },
  secondReview: { select: { id: true, totalScore: true, reviewerId: true, reviewer: { select: { name: true } } } },
  thirdReviewAssignment: {
    select: {
      id: true,
      status: true,
      reviewerId: true,
      reviewer: { select: { name: true } },
      review: { select: { status: true, totalScore: true, submittedAt: true } },
    },
  },
} satisfies Prisma.ReviewEscalationInclude;

export function listEscalationsForCohort(cohortId: string) {
  return prisma.reviewEscalation.findMany({
    where: { application: { cohortId } },
    include: ESCALATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export type EscalationWithDetail = Awaited<ReturnType<typeof listEscalationsForCohort>>[number];
