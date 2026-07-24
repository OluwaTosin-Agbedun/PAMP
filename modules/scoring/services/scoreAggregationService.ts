import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { Prisma } from "@/lib/generated/prisma/client";

import { calculateCompositeScore } from "@/modules/ranking/domain/ranking";

import * as repo from "../repositories/applicationScoreRepository";

/**
 * The `ScoreAggregationService` `docs/database.md`'s `ApplicationScore`
 * doc comment named as the table's one writer, deferred since Phase 3B
 * ("explicitly out of scope"). Release 1 Module 1 builds the *review*
 * half only — populating `reviewAverage`/`reviewScoreCount`, the input
 * the Interview Assignment Engine's "Top 70" shortlist needs.
 * `interviewAverage`/`compositeScore`/`rank`/`rankingTier` are Module
 * 5's Final Ranking Engine, not built here.
 *
 * ## The aggregation formula (flagged, evidence-based interpretation)
 *
 * Neither the Phase 3A/3B briefs nor `docs/SCORE_CALCULATION_RULES.md`/
 * `docs/THIRD_REVIEW_ENGINE.md` state what "the application's overall
 * review score" is for a *non*-escalated pair (R1 and R2 didn't
 * diverge) — only the escalated case is documented ("lower of the first
 * two, averaged with the third," `calculateFinalScoreAfterThirdReview`).
 * This service applies the same operation the codebase already uses
 * whenever combining multiple independent reviewer scores into one
 * figure — averaging — to the simpler non-escalated case:
 * `reviewAverage = mean(R1.totalScore, R2.totalScore)`. This is
 * presented as a consistent extension of an already-decided pattern,
 * not a novel invention, but it has not been confirmed against an
 * authoritative programme source and should be treated as provisional
 * until a programme owner confirms it — see
 * `docs/adr/ADR-0015-review-score-aggregation-formula.md`.
 */
export async function recomputeReviewAverage(applicationId: string): Promise<void> {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { cohortId: true },
  });

  const [submittedReviews, escalation] = await Promise.all([
    repo.listSubmittedReviewsForApplication(applicationId),
    repo.getEscalationForApplication(applicationId),
  ]);

  const firstAndSecond = submittedReviews.filter((r) => r.reviewAssignment.slot === "FIRST" || r.reviewAssignment.slot === "SECOND");
  const scoredFirstAndSecond = firstAndSecond.filter((r): r is typeof r & { totalScore: Prisma.Decimal } => r.totalScore !== null);

  let reviewAverage: Prisma.Decimal | null = null;
  let reviewScoreCount = scoredFirstAndSecond.length;

  if (escalation) {
    // An escalation exists — ranking-ready only once it's resolved
    // (§9: the third reviewer's score is the missing input until then).
    if (escalation.resolvedFinalScore !== null) {
      reviewAverage = escalation.resolvedFinalScore;
      reviewScoreCount = 3;
    }
  } else if (scoredFirstAndSecond.length === 2) {
    // The normal, non-escalated path — see this file's doc comment.
    const sum = scoredFirstAndSecond.reduce((acc, r) => acc.plus(r.totalScore), new Prisma.Decimal(0));
    reviewAverage = sum.dividedBy(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  // Fewer than 2 submitted (0 or 1) with no escalation: not
  // ranking-ready yet — reviewAverage stays null, matching
  // "written only by ScoreAggregationService" rather than a partial or
  // guessed figure.

  await repo.upsertReviewAverage(applicationId, application.cohortId, { reviewAverage, reviewScoreCount });
  await recomputeCompositeScore(applicationId);
}

/**
 * Interview-side counterpart of `recomputeReviewAverage`, added for
 * Addendum Module 2 (§2.7): `interviewAverage`/`interviewScoreCount` were
 * declared with the original schema but had no writer until now (see
 * `docs/INTERVIEW_ASSIGNMENT_ENGINE.md`'s "Not built this module").
 * Deliberately re-derives the `<3` floor itself rather than trusting the
 * caller to have already confirmed the threshold — this figure feeds
 * Module 4's Final Ranking, too consequential to trust caller discipline
 * alone for.
 */
export async function recomputeInterviewAverage(applicationId: string): Promise<void> {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { cohortId: true },
  });

  const submittedScores = await repo.listSubmittedInterviewScoresForApplication(applicationId);
  const scoredOnly = submittedScores.filter((s): s is typeof s & { totalScore: Prisma.Decimal } => s.totalScore !== null);

  let interviewAverage: Prisma.Decimal | null = null;
  const interviewScoreCount = scoredOnly.length;

  if (scoredOnly.length >= 3) {
    // Addendum §2.7 — sum of valid interview totals ÷ number of valid
    // submissions. Never averaged with fewer than three (§2.6).
    const sum = scoredOnly.reduce((acc, s) => acc.plus(s.totalScore), new Prisma.Decimal(0));
    interviewAverage = sum.dividedBy(scoredOnly.length).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  await repo.upsertInterviewAverage(applicationId, application.cohortId, { interviewAverage, interviewScoreCount });
  await recomputeCompositeScore(applicationId);
}

/**
 * Final Ranking's own aggregation step (Addendum Module 4:
 * "Application Review (/60) + Interview (/40) = Final Score (/100)...
 * Audit every recalculation"). Called from the tail of both functions
 * above rather than by their external callers — keeps this module the
 * single writer of every `ApplicationScore` column, matching its own
 * doc comment, and means neither `assignmentService.ts` nor
 * `interviewScoreService.ts` needs to know a composite score exists.
 * Only writes and audits when the value actually changes, the same
 * "no-op audit spam" discipline `recalculateReview` established
 * (docs/SCORE_CALCULATION_RULES.md) — every review/interview submission
 * calls this, so a silent no-op the vast majority of the time (whichever
 * of the two averages *isn't* newly available yet) must not write an
 * audit row.
 */
export async function recomputeCompositeScore(applicationId: string): Promise<void> {
  const current = await prisma.applicationScore.findUnique({
    where: { applicationId },
    select: { reviewAverage: true, interviewAverage: true, compositeScore: true },
  });
  if (!current) return;

  const nextCompositeScore =
    current.reviewAverage !== null && current.interviewAverage !== null
      ? calculateCompositeScore(current.reviewAverage, current.interviewAverage)
      : null;

  const previous = current.compositeScore;
  const unchanged =
    (previous === null && nextCompositeScore === null) || (previous !== null && nextCompositeScore !== null && previous.equals(nextCompositeScore));
  if (unchanged) return;

  await prisma.applicationScore.update({ where: { applicationId }, data: { compositeScore: nextCompositeScore } });

  await writeAuditLog({
    actorId: null,
    action: AUDIT_ACTIONS.RANKING_COMPOSITE_SCORE_CALCULATED,
    entityType: "ApplicationScore",
    entityId: applicationId,
    metadata: { from: previous?.toString() ?? null, to: nextCompositeScore?.toString() ?? null },
  });
}
