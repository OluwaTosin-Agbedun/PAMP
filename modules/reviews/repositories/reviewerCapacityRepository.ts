import "server-only";

import { prisma } from "@/lib/db/prisma";

/** Pure data access for ReviewerCapacity. */

export type CapacityUpsertFields = {
  maxConcurrentAssignments?: number;
  isAvailable?: boolean;
  unavailableReason?: string | null;
  unavailableUntil?: Date | null;
};

export function getCapacity(reviewerId: string, programmeId: string) {
  return prisma.reviewerCapacity.findUnique({
    where: { reviewerId_programmeId: { reviewerId, programmeId } },
  });
}

export function listCapacitiesForReviewers(reviewerIds: string[], programmeId: string) {
  if (reviewerIds.length === 0) return Promise.resolve([]);
  return prisma.reviewerCapacity.findMany({
    where: { reviewerId: { in: reviewerIds }, programmeId },
  });
}

export function listCapacitiesForProgramme(programmeId: string) {
  return prisma.reviewerCapacity.findMany({ where: { programmeId } });
}

export function upsertCapacity(reviewerId: string, programmeId: string, data: CapacityUpsertFields) {
  return prisma.reviewerCapacity.upsert({
    where: { reviewerId_programmeId: { reviewerId, programmeId } },
    create: { reviewerId, programmeId, ...data },
    update: data,
  });
}
