import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma, ReviewStatus } from "@/lib/generated/prisma/client";

/** Pure data access for Review/ReviewScore — see frameworkRepository.ts's doc comment for why this layer stays dumb. */

const REVIEW_WITH_SCORES = {
  scores: true,
  reviewFramework: {
    include: {
      criteria: { include: { ratingScale: { include: { bands: true } } } },
      reviewStage: true,
    },
  },
  // Nests `applicant` (Phase 3C) so the Reviewer Workspace's scoring page
  // can show who's being reviewed without a second query — additive to
  // every existing consumer, which only ever read Application's own
  // scalar fields (e.g. `application.eligibilityStatus` in submitReview).
  application: { include: { applicant: true } },
} satisfies Prisma.ReviewInclude;

export function getReview(id: string) {
  return prisma.review.findUnique({ where: { id }, include: REVIEW_WITH_SCORES });
}

export function getReviewByAssignment(reviewAssignmentId: string) {
  return prisma.review.findUnique({ where: { reviewAssignmentId }, include: REVIEW_WITH_SCORES });
}

export function createReview(data: Prisma.ReviewUncheckedCreateInput) {
  return prisma.review.create({ data, include: REVIEW_WITH_SCORES });
}

/**
 * Status-conditioned update: only succeeds if the row is still in
 * `fromStatus` at write time. A concurrent second writer whose read
 * happened before this one committed will find zero matching rows and
 * get `count: 0` back — the service layer treats that as
 * `ReviewConcurrencyError` rather than silently overwriting (§18). No
 * extra version column needed: `status` itself is the guard, since every
 * status-changing operation already has a well-defined expected
 * "from" state (see modules/reviews/domain/lifecycle.ts).
 */
export function updateReviewStatus(
  reviewId: string,
  fromStatus: ReviewStatus,
  data: Prisma.ReviewUncheckedUpdateManyInput,
) {
  return prisma.review.updateMany({ where: { id: reviewId, status: fromStatus }, data });
}

/** Non-status-changing update (e.g. recalculated totalScore) — no concurrency guard needed beyond the transaction it runs in. */
export function updateReviewTotal(reviewId: string, totalScore: Prisma.Decimal) {
  return prisma.review.update({ where: { id: reviewId }, data: { totalScore } });
}

export function upsertScore(
  reviewId: string,
  criterionId: string,
  data: { score: Prisma.Decimal; comment: string | null },
) {
  return prisma.reviewScore.upsert({
    where: { reviewId_criterionId: { reviewId, criterionId } },
    create: { reviewId, criterionId, ...data },
    update: data,
  });
}

export function removeScore(reviewId: string, criterionId: string) {
  return prisma.reviewScore.deleteMany({ where: { reviewId, criterionId } });
}

export function listScores(reviewId: string) {
  return prisma.reviewScore.findMany({ where: { reviewId } });
}
