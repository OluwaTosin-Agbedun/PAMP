import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Pure data access for ReviewEscalation. */

export function getEscalationForPair(applicationId: string, firstReviewId: string, secondReviewId: string) {
  return prisma.reviewEscalation.findUnique({
    where: { applicationId_firstReviewId_secondReviewId: { applicationId, firstReviewId, secondReviewId } },
  });
}

export function getEscalationByThirdAssignment(thirdReviewAssignmentId: string) {
  return prisma.reviewEscalation.findUnique({ where: { thirdReviewAssignmentId } });
}

export function createEscalation(
  tx: Prisma.TransactionClient,
  data: Prisma.ReviewEscalationUncheckedCreateInput,
) {
  return tx.reviewEscalation.create({ data });
}

export function attachThirdReviewAssignment(
  tx: Prisma.TransactionClient,
  escalationId: string,
  thirdReviewAssignmentId: string,
) {
  return tx.reviewEscalation.update({ where: { id: escalationId }, data: { thirdReviewAssignmentId } });
}

export function resolveEscalation(
  tx: Prisma.TransactionClient,
  escalationId: string,
  resolvedFinalScore: Prisma.Decimal,
) {
  return tx.reviewEscalation.update({
    where: { id: escalationId },
    data: { resolvedFinalScore, resolvedAt: new Date() },
  });
}

export function listEscalationsForApplication(applicationId: string) {
  return prisma.reviewEscalation.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } });
}
