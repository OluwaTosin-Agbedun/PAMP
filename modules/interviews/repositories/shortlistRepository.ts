import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Applications ranked by review score, best first — the candidate pool a shortlist is drawn from. Only applications with a computed reviewAverage are ranking-ready (see scoreAggregationService). */
export function listRankedApplicationsByReviewScore(cohortId: string) {
  return prisma.applicationScore.findMany({
    where: { cohortId, reviewAverage: { not: null } },
    orderBy: { reviewAverage: "desc" },
    include: { application: { include: { applicant: true } } },
  });
}

export function createShortlistSnapshot(
  cohortId: string,
  name: string,
  targetSize: number,
  generatedById: string,
  entries: { applicationId: string; rank: number; score: Prisma.Decimal }[],
) {
  return prisma.rankingSnapshot.create({
    data: {
      cohortId,
      name,
      targetSize,
      generatedById,
      entries: { createMany: { data: entries } },
    },
    include: { entries: true },
  });
}

export function getLatestSnapshotByName(cohortId: string, name: string) {
  return prisma.rankingSnapshot.findFirst({
    where: { cohortId, name },
    orderBy: { generatedAt: "desc" },
    include: { entries: { include: { application: { include: { applicant: true } } }, orderBy: { rank: "asc" } } },
  });
}
