import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

export const FINAL_RANKING_SNAPSHOT_NAME = "Final Ranking";

/** Every application-score row for a cohort, with everything eligibility needs to check. */
export function listApplicationScoresForCohort(cohortId: string) {
  return prisma.applicationScore.findMany({
    where: { cohortId },
    include: {
      application: {
        include: { applicant: true },
      },
    },
  });
}

/**
 * Applications with a submitted interview score carrying an integrity
 * hold (Score Sheet `integrityFlag`, or the `INTEGRITY_HOLD`
 * recommendation) — metrics-framework.md §9/§12: "Integrity Concern →
 * Hold/Disqualify... overrides score." A Set, not a per-application
 * query, since ranking always evaluates the whole cohort at once.
 */
export async function listApplicationIdsWithIntegrityHold(cohortId: string): Promise<Set<string>> {
  const rows = await prisma.interviewScore.findMany({
    where: {
      status: "SUBMITTED",
      interview: { cohortId },
      OR: [{ integrityFlag: true }, { recommendation: "INTEGRITY_HOLD" }],
    },
    select: { interview: { select: { applicationId: true } } },
  });
  return new Set(rows.map((row) => row.interview.applicationId));
}

export function getLatestSnapshotForCohort(cohortId: string) {
  return prisma.rankingSnapshot.findFirst({
    where: { cohortId, name: FINAL_RANKING_SNAPSHOT_NAME },
    orderBy: { generatedAt: "desc" },
  });
}

export function getSnapshotDetail(id: string) {
  return prisma.rankingSnapshot.findUnique({
    where: { id },
    include: {
      entries: {
        include: { application: { include: { applicant: true } } },
        orderBy: { rank: "asc" },
      },
      tieResolutions: {
        include: {
          applications: { include: { application: { include: { applicant: true } } } },
          resolvedBy: { select: { id: true, name: true } },
        },
      },
      generatedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      reopenedBy: { select: { id: true, name: true } },
    },
  });
}

export function createFinalRankingSnapshot(
  cohortId: string,
  targetSize: number,
  generatedById: string,
  entries: { applicationId: string; rank: number; score: Prisma.Decimal }[],
) {
  return prisma.rankingSnapshot.create({
    data: {
      cohortId,
      name: FINAL_RANKING_SNAPSHOT_NAME,
      targetSize,
      generatedById,
      entries: { createMany: { data: entries } },
    },
    include: { entries: true },
  });
}

export function createTieResolutions(
  rankingSnapshotId: string,
  cohortId: string,
  groups: { score: Prisma.Decimal; applicationIds: string[] }[],
) {
  return prisma.$transaction(
    groups.map((group) =>
      prisma.rankingTieResolution.create({
        data: {
          rankingSnapshotId,
          cohortId,
          score: group.score,
          applications: { createMany: { data: group.applicationIds.map((applicationId) => ({ applicationId })) } },
        },
      }),
    ),
  );
}

/**
 * Bulk-writes `ApplicationScore.rank` to match a freshly generated
 * snapshot — the "current standing" cache stays in sync with the latest
 * ranking without a second read. `rank: null` is for applications that
 * were ranked before but are excluded from this new generation (§5.3:
 * "prevent stale rankings from being presented as current" — a rank
 * left over from a superseded snapshot is exactly that).
 */
export async function updateApplicationScoreRanks(entries: { applicationId: string; rank: number | null }[]) {
  await prisma.$transaction(
    entries.map((entry) =>
      prisma.applicationScore.update({ where: { applicationId: entry.applicationId }, data: { rank: entry.rank } }),
    ),
  );
}

export function lockSnapshot(id: string, approvedById: string) {
  return prisma.rankingSnapshot.update({
    where: { id },
    data: { isLocked: true, approvedById, approvedAt: new Date() },
  });
}

export function unlockSnapshot(id: string, reopenedById: string, reason: string) {
  return prisma.rankingSnapshot.update({
    where: { id },
    data: { isLocked: false, reopenedById, reopenedAt: new Date(), reopenReason: reason },
  });
}

export function getTieResolution(id: string) {
  return prisma.rankingTieResolution.findUnique({
    where: { id },
    include: { applications: true, rankingSnapshot: true },
  });
}

export function listTieResolutionsForSnapshot(rankingSnapshotId: string) {
  return prisma.rankingTieResolution.findMany({
    where: { rankingSnapshotId },
    include: { applications: { include: { application: { include: { applicant: true } } } } },
  });
}

export async function resolveTieResolution(
  id: string,
  data: { resolvedById: string; justification: string; resolvedRanks: { applicationId: string; resolvedRank: number }[] },
) {
  await prisma.$transaction([
    prisma.rankingTieResolution.update({
      where: { id },
      data: {
        status: "RESOLVED",
        justification: data.justification,
        resolvedById: data.resolvedById,
        resolvedAt: new Date(),
      },
    }),
    ...data.resolvedRanks.map((entry) =>
      prisma.rankingTieResolutionApplication.updateMany({
        where: { rankingTieResolutionId: id, applicationId: entry.applicationId },
        data: { resolvedRank: entry.resolvedRank },
      }),
    ),
  ]);
}

export function getApplicationForRankingDetail(applicationId: string) {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      applicant: true,
      applicationScore: true,
    },
  });
}
