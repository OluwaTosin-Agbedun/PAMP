import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

export function listSubmittedReviewsForApplication(applicationId: string) {
  return prisma.review.findMany({
    where: { applicationId, status: "SUBMITTED" },
    select: { id: true, totalScore: true, reviewAssignment: { select: { slot: true } } },
  });
}

export function getEscalationForApplication(applicationId: string) {
  return prisma.reviewEscalation.findFirst({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
  });
}

export function upsertReviewAverage(
  applicationId: string,
  cohortId: string,
  data: { reviewAverage: Prisma.Decimal | null; reviewScoreCount: number },
) {
  return prisma.applicationScore.upsert({
    where: { applicationId },
    create: { applicationId, cohortId, ...data, lastComputedAt: new Date() },
    update: { ...data, lastComputedAt: new Date() },
  });
}

/** Interview-side counterpart of listSubmittedReviewsForApplication above. */
export function listSubmittedInterviewScoresForApplication(applicationId: string) {
  return prisma.interviewScore.findMany({
    where: { status: "SUBMITTED", interview: { applicationId } },
    select: { id: true, totalScore: true },
  });
}

/**
 * Interview-side counterpart of upsertReviewAverage — only ever touches
 * interviewAverage/interviewScoreCount, never reviewAverage/
 * reviewScoreCount on the same row, and vice versa (Prisma's `update`
 * only writes the keys present in `data`).
 */
export function upsertInterviewAverage(
  applicationId: string,
  cohortId: string,
  data: { interviewAverage: Prisma.Decimal | null; interviewScoreCount: number },
) {
  return prisma.applicationScore.upsert({
    where: { applicationId },
    create: { applicationId, cohortId, ...data, lastComputedAt: new Date() },
    update: { ...data, lastComputedAt: new Date() },
  });
}
