import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import {
  AuthorisationError,
  ConflictError,
  FrameworkNotPublishedError,
  IncompleteReviewError,
  InvalidScoreError,
  NotFoundError,
  ReviewAlreadySubmittedError,
  ReviewConcurrencyError,
  ReviewPeriodClosedError,
  ValidationError,
} from "@/lib/errors";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Review, ReviewStatus } from "@/lib/generated/prisma/client";
import { requirePermission } from "@/lib/permissions/service";
import { PERMISSIONS } from "@/lib/permissions/catalog";

import { calculateReviewTotal, getReviewScoreBreakdown } from "../domain/scoring";
import { assertTransition } from "../domain/lifecycle";
import { validateReviewScores } from "../domain/validation";
import * as reviewRepo from "../repositories/reviewRepository";
import { onReviewSubmitted } from "./assignmentService";
import type { ReopenReviewInput, SaveDraftScoresInput, SubmitReviewInput } from "../validation/schemas";
import type { CriterionWithScale, ScoreValidationIssue } from "../types/scoring";

/**
 * Review lifecycle orchestration: ownership checks, permission checks,
 * status transitions (via modules/reviews/domain/lifecycle.ts),
 * database-verified validation (via modules/reviews/domain/validation.ts),
 * transactions, and audit logging. Like frameworkService.ts, nothing
 * here is wired to a Server Action/route yet — the Reviewer Workspace is
 * out of scope for Phase 3A (§3) — but this is the exact boundary its
 * Server Actions would call.
 */

const MISSING_ISSUE_CODES = new Set(["MISSING_MANDATORY_SCORE", "COMMENT_REQUIRED", "OVERALL_COMMENT_REQUIRED"]);

function throwForSubmitIssues(issues: ScoreValidationIssue[]): never {
  const onlyMissing = issues.every((issue) => MISSING_ISSUE_CODES.has(issue.code));
  const message = issues.map((issue) => issue.message).join(" ");
  if (onlyMissing) {
    throw new IncompleteReviewError(message);
  }
  throw new InvalidScoreError(message);
}

async function loadReviewOrThrow(reviewId: string) {
  const review = await reviewRepo.getReview(reviewId);
  if (!review) throw new NotFoundError("That review doesn't exist.");
  return review;
}

function assertOwnership(review: Pick<Review, "reviewerId">, actorId: string) {
  if (review.reviewerId !== actorId) {
    throw new AuthorisationError("This review belongs to a different reviewer.");
  }
}

function isStageOpen(stage: { opensAt: Date | null; closesAt: Date | null }, now: Date): boolean {
  if (stage.opensAt && now < stage.opensAt) return false;
  if (stage.closesAt && now > stage.closesAt) return false;
  return true;
}

export async function createReview(actorId: string, reviewAssignmentId: string) {
  await requirePermission(actorId, PERMISSIONS.REVIEWS_PERFORM);

  const assignment = await prisma.reviewAssignment.findUnique({
    where: { id: reviewAssignmentId },
    include: { application: true },
  });
  if (!assignment) throw new NotFoundError("That review assignment doesn't exist.");
  if (assignment.reviewerId !== actorId) {
    throw new AuthorisationError("This assignment belongs to a different reviewer.");
  }

  const existing = await reviewRepo.getReviewByAssignment(reviewAssignmentId);
  if (existing) return existing;

  const cohort = await prisma.cohort.findUniqueOrThrow({ where: { id: assignment.application.cohortId } });

  // In V1.0 there's exactly one review stage that applies (Application
  // Review) — a future multi-stage flow would resolve the *correct*
  // stage for this assignment from explicit context (e.g. the
  // assignment's slot or a stage parameter) rather than "the active
  // stage for this programme/cohort." Flagged in
  // docs/PHASE_3A_IMPLEMENTATION_REPORT.md as a decision to revisit once
  // a second stage (Interview) actually exists.
  const stage = await prisma.reviewStage.findFirst({
    where: {
      programmeId: cohort.programmeId,
      OR: [{ cohortId: cohort.id }, { cohortId: null }],
      status: "ACTIVE",
    },
    orderBy: { sequenceOrder: "asc" },
  });
  if (!stage) throw new FrameworkNotPublishedError("No review stage is currently active.");

  const framework = await prisma.reviewFramework.findFirst({
    where: { reviewStageId: stage.id, status: "PUBLISHED" },
  });
  if (!framework) throw new FrameworkNotPublishedError();

  const review = await reviewRepo.createReview({
    reviewAssignmentId,
    applicationId: assignment.applicationId,
    reviewerId: actorId,
    reviewFrameworkId: framework.id,
    status: "NOT_STARTED",
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.REVIEW_CREATED,
    entityType: "Review",
    entityId: review.id,
    metadata: { applicationId: assignment.applicationId, reviewFrameworkId: framework.id },
  });

  return review;
}

export async function saveDraftScores(actorId: string, input: SaveDraftScoresInput) {
  await requirePermission(actorId, PERMISSIONS.REVIEWS_PERFORM);

  const review = await loadReviewOrThrow(input.reviewId);
  assertOwnership(review, actorId);

  if (review.status === "SUBMITTED") throw new ReviewAlreadySubmittedError();
  if (review.status === "RECUSED" || review.status === "CANCELLED") {
    throw new ConflictError("This review is no longer active.");
  }

  const criteria = review.reviewFramework.criteria as unknown as CriterionWithScale[];
  const stage = review.reviewFramework.reviewStage;

  const result = validateReviewScores(criteria, input.scores, {
    mode: "draft",
    allCriteriaMandatory: stage.allCriteriaMandatory,
  });
  if (!result.valid) {
    throw new InvalidScoreError(result.issues.map((i) => i.message).join(" "));
  }

  await prisma.$transaction(async (tx) => {
    for (const entry of result.entries) {
      await tx.reviewScore.upsert({
        where: { reviewId_criterionId: { reviewId: review.id, criterionId: entry.criterionId } },
        create: { reviewId: review.id, criterionId: entry.criterionId, score: entry.score, comment: entry.comment },
        update: { score: entry.score, comment: entry.comment },
      });
    }

    const allScores = await tx.reviewScore.findMany({ where: { reviewId: review.id } });
    const total = calculateReviewTotal(allScores, criteria, review.reviewFramework.scoringMethod);

    const nextStatus: ReviewStatus = review.status === "NOT_STARTED" ? "IN_PROGRESS" : review.status;
    if (nextStatus !== review.status) assertTransition(review.status, nextStatus);

    const updated = await tx.review.updateMany({
      where: { id: review.id, status: review.status },
      data: { status: nextStatus, totalScore: total },
    });
    if (updated.count === 0) throw new ReviewConcurrencyError();
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.REVIEW_DRAFT_SCORE_SAVED,
    entityType: "Review",
    entityId: review.id,
    metadata: { criteriaScored: result.entries.length },
  });

  return getReviewScoreBreakdownFor(review.id);
}

export async function removeDraftScore(actorId: string, reviewId: string, criterionId: string) {
  await requirePermission(actorId, PERMISSIONS.REVIEWS_PERFORM);

  const review = await loadReviewOrThrow(reviewId);
  assertOwnership(review, actorId);
  if (review.status === "SUBMITTED") throw new ReviewAlreadySubmittedError();

  await reviewRepo.removeScore(reviewId, criterionId);

  const criteria = review.reviewFramework.criteria as unknown as CriterionWithScale[];
  const allScores = await reviewRepo.listScores(reviewId);
  const total = calculateReviewTotal(allScores, criteria, review.reviewFramework.scoringMethod);
  await reviewRepo.updateReviewTotal(reviewId, total);

  return getReviewScoreBreakdownFor(reviewId);
}

/**
 * Transactional: either every score row is written and the review flips
 * to SUBMITTED, or nothing changes (§12). The status-conditioned update
 * inside the transaction (`updateReviewStatus`, `where: {status:
 * fromStatus}`) is what makes a double submission fail cleanly instead
 * of double-processing — see reviewRepository.ts's doc comment.
 */
export async function submitReview(actorId: string, input: SubmitReviewInput) {
  await requirePermission(actorId, PERMISSIONS.REVIEW_SCORES_SUBMIT);

  const review = await loadReviewOrThrow(input.reviewId);
  assertOwnership(review, actorId);

  if (review.status === "SUBMITTED") throw new ReviewAlreadySubmittedError();
  assertTransition(review.status, "SUBMITTED");

  const framework = review.reviewFramework;
  if (framework.status !== "PUBLISHED") throw new FrameworkNotPublishedError();

  const stage = framework.reviewStage;
  if (!isStageOpen(stage, new Date())) throw new ReviewPeriodClosedError();

  if (review.application.eligibilityStatus !== "ELIGIBLE") {
    throw new ValidationError("This application is no longer eligible for this review stage.");
  }

  const criteria = framework.criteria as unknown as CriterionWithScale[];
  const result = validateReviewScores(criteria, input.scores, {
    mode: "submit",
    allCriteriaMandatory: stage.allCriteriaMandatory,
    overallCommentRequired: stage.commentsRequired,
    overallComment: input.comments,
  });
  if (!result.valid) throwForSubmitIssues(result.issues);

  const total = calculateReviewTotal(result.entries, criteria, framework.scoringMethod);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const entry of result.entries) {
      await tx.reviewScore.upsert({
        where: { reviewId_criterionId: { reviewId: review.id, criterionId: entry.criterionId } },
        create: { reviewId: review.id, criterionId: entry.criterionId, score: entry.score, comment: entry.comment },
        update: { score: entry.score, comment: entry.comment },
      });
    }

    const updated = await tx.review.updateMany({
      where: { id: review.id, status: review.status },
      data: { status: "SUBMITTED", totalScore: total, comments: input.comments ?? null, submittedAt: now },
    });
    if (updated.count === 0) throw new ReviewConcurrencyError();
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.REVIEW_SUBMITTED,
    entityType: "Review",
    entityId: review.id,
    metadata: { total: total.toString(), reviewFrameworkId: framework.id, frameworkVersion: framework.version },
  });

  // Phase 3B: syncs ReviewAssignment.status to SUBMITTED and, for a
  // FIRST/SECOND review, checks whether both of the pair have now
  // submitted with a divergence large enough to trigger a third review
  // (§9) — or, for a THIRD review, resolves that escalation. A follow-up
  // call after this function's own transaction has committed, not inside
  // it — the same "primary transaction, then side-effect" sequencing
  // Sequence 1 already established for eligibility → autoAssignReviewers.
  await onReviewSubmitted(review.id);

  return getReviewScoreBreakdownFor(review.id);
}

/**
 * Authorised, audited, reason-required (§13). The prior submitted
 * state (scores + total + submission timestamp) is preserved in the
 * audit entry's metadata — not a second copy of the scores in the
 * schema — so "reconstruct the prior submitted state" means reading one
 * audit row, not maintaining a parallel history table.
 */
export async function reopenReview(actorId: string, input: ReopenReviewInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.REVIEW_SCORES_REOPEN);

  const review = await loadReviewOrThrow(input.reviewId);
  assertTransition(review.status, "REOPENED");

  const priorScores = await reviewRepo.listScores(review.id);
  const now = new Date();

  const updated = await reviewRepo.updateReviewStatus(review.id, review.status, {
    status: "REOPENED",
    reopenedAt: now,
    reopenedById: actor.id,
    reopenReason: input.reason,
  });
  if (updated.count === 0) throw new ReviewConcurrencyError();

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.REVIEW_REOPENED,
    entityType: "Review",
    entityId: review.id,
    metadata: {
      reason: input.reason,
      priorStatus: review.status,
      priorTotal: review.totalScore?.toString() ?? null,
      priorSubmittedAt: review.submittedAt?.toISOString() ?? null,
      priorScores: priorScores.map((s) => ({ criterionId: s.criterionId, score: s.score.toString(), comment: s.comment })),
    },
  });

  return getReview(review.id);
}

/**
 * Recomputes and (if it drifted) persists a review's total — an
 * administrative correction action (same permission as reopening), not
 * something a reviewer triggers themselves. Writes an audit entry only
 * when the recalculated value actually differs from what was stored, so
 * routine recalculation-after-reopen doesn't create noise when nothing
 * changed.
 */
export async function recalculateReview(actorId: string, reviewId: string) {
  await requirePermission(actorId, PERMISSIONS.REVIEW_SCORES_REOPEN);

  const review = await loadReviewOrThrow(reviewId);
  const criteria = review.reviewFramework.criteria as unknown as CriterionWithScale[];
  const scores = await reviewRepo.listScores(reviewId);
  const total = calculateReviewTotal(scores, criteria, review.reviewFramework.scoringMethod);

  const previous = review.totalScore ? new Prisma.Decimal(review.totalScore) : null;
  if (!previous || !previous.equals(total)) {
    await reviewRepo.updateReviewTotal(reviewId, total);
    await writeAuditLog({
      actorId,
      action: AUDIT_ACTIONS.REVIEW_RECALCULATED,
      entityType: "Review",
      entityId: reviewId,
      metadata: { from: previous?.toString() ?? null, to: total.toString() },
    });
  }

  return getReviewScoreBreakdownFor(reviewId);
}

export async function getReview(reviewId: string) {
  const review = await loadReviewOrThrow(reviewId);
  return review;
}

async function getReviewScoreBreakdownFor(reviewId: string) {
  const review = await loadReviewOrThrow(reviewId);
  const criteria = review.reviewFramework.criteria as unknown as CriterionWithScale[];
  const entries = review.scores.map((s) => ({ criterionId: s.criterionId, score: s.score, comment: s.comment }));
  return getReviewScoreBreakdown(entries, criteria, review.reviewFramework.scoringMethod);
}

export async function getReviewScoreBreakdownForActor(actorId: string, reviewId: string) {
  const review = await loadReviewOrThrow(reviewId);
  if (review.reviewerId !== actorId) {
    await requirePermission(actorId, PERMISSIONS.REVIEW_SCORES_VIEW);
  }
  return getReviewScoreBreakdownFor(reviewId);
}
