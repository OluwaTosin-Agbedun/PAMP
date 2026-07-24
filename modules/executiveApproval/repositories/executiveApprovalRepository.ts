import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { RankingApprovalDecision, RankingApprovalStageType } from "@/lib/generated/prisma/enums";

/** Lightweight existence/ownership check — avoids pulling in `rankingRepository`'s heavy entries/tieResolutions include for a check this module doesn't need. */
export function getRankingSnapshotSummary(id: string) {
  return prisma.rankingSnapshot.findUnique({
    where: { id },
    select: { id: true, cohortId: true, name: true, targetSize: true, isLocked: true },
  });
}

export function listApprovalStagesForSnapshot(rankingSnapshotId: string) {
  return prisma.rankingApprovalStage.findMany({
    where: { rankingSnapshotId },
    orderBy: { createdAt: "asc" },
    include: { approver: { select: { id: true, name: true } } },
  });
}

export function createApprovalStage(data: {
  rankingSnapshotId: string;
  stage: RankingApprovalStageType;
  decision: RankingApprovalDecision;
  approverId: string;
  comment: string | null;
  previousStatus: string | null;
  newStatus: string;
}) {
  return prisma.rankingApprovalStage.create({
    data,
    include: { approver: { select: { id: true, name: true } } },
  });
}
