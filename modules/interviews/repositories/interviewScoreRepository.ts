import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma, ScoreSubmissionStatus } from "@/lib/generated/prisma/client";

/**
 * Pure data access for InterviewScore/InterviewScoreEntry/InterviewCriterion
 * — no business rules, no permission checks, no audit writes. Mirrors
 * modules/reviews/repositories/reviewRepository.ts's shape.
 */

export function listActiveCriteriaForCohort(cohortId: string) {
  return prisma.interviewCriterion.findMany({
    where: { cohortId, isActive: true },
    orderBy: { order: "asc" },
  });
}

export function getScore(id: string) {
  return prisma.interviewScore.findUnique({ where: { id }, include: { entries: true } });
}

export function getScoreByInterviewAndPanelist(interviewId: string, panelistId: string) {
  return prisma.interviewScore.findUnique({
    where: { interviewId_panelistId: { interviewId, panelistId } },
    include: { entries: true },
  });
}

export function createScore(data: { interviewId: string; panelistId: string }) {
  return prisma.interviewScore.create({ data, include: { entries: true } });
}

/** Every InterviewScore row for an interview — for the "N of M panellists submitted" progress signal. */
export function listScoresForInterview(interviewId: string) {
  return prisma.interviewScore.findMany({ where: { interviewId } });
}

/**
 * Every InterviewScore row for an interview, with the panellist's identity
 * and full entries — for the Secretariat/Committee/Executive oversight
 * view (Addendum §2.4). Never used for the panellist-facing progress
 * signal above, which deliberately stays comment/identity-free.
 */
export function listScoresForInterviewWithPanelist(interviewId: string) {
  return prisma.interviewScore.findMany({
    where: { interviewId },
    include: {
      panelist: { select: { id: true, name: true, email: true } },
      entries: true,
    },
  });
}

export function upsertEntry(tx: Prisma.TransactionClient, interviewScoreId: string, criterionId: string, score: Prisma.Decimal) {
  return tx.interviewScoreEntry.upsert({
    where: { interviewScoreId_criterionId: { interviewScoreId, criterionId } },
    create: { interviewScoreId, criterionId, score },
    update: { score },
  });
}

export function listEntries(interviewScoreId: string) {
  return prisma.interviewScoreEntry.findMany({ where: { interviewScoreId } });
}

/** Status-conditioned update — a write only succeeds if the row is still in `fromStatus`. */
export function updateScoreStatus(
  tx: Prisma.TransactionClient | typeof prisma,
  scoreId: string,
  fromStatus: ScoreSubmissionStatus,
  data: Prisma.InterviewScoreUncheckedUpdateManyInput,
) {
  return tx.interviewScore.updateMany({ where: { id: scoreId, status: fromStatus }, data });
}
