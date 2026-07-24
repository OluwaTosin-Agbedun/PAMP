import { Prisma } from "@/lib/generated/prisma/client";
import type { ReviewCriterion, ReviewScoringMethod } from "@/lib/generated/prisma/client";

import { SCORE_DECIMAL_PLACES, SCORE_ROUNDING_MODE } from "../constants/scoring";
import type { CriterionBreakdown, ReviewScoreBreakdown, ValidatedScoreEntry } from "../types/scoring";

const { Decimal } = Prisma;

/**
 * The one authoritative scoring implementation (§10) — every place in
 * this codebase that needs a review total calls into here rather than
 * reimplementing the formula. Pure: no I/O, no Prisma queries, no
 * `Date.now()` — the same (entries, criteria) input always produces the
 * same output, which is both the §9 determinism requirement and what
 * makes this module trivial to unit test in isolation (tests/unit/
 * reviewScoring.test.ts).
 */

export function toDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** One criterion's contribution to the total: rawScore × weight, unrounded. */
export function calculateCriterionScore(
  rawScore: Prisma.Decimal | number | string,
  weight: Prisma.Decimal | number | string,
): Prisma.Decimal {
  return toDecimal(rawScore).times(toDecimal(weight));
}

/** Sum of raw scores as entered, ignoring weight — for display/debugging, not the authoritative total. */
export function calculateReviewRawScore(entries: Pick<ValidatedScoreEntry, "score">[]): Prisma.Decimal {
  return entries.reduce((sum, entry) => sum.plus(entry.score), new Decimal(0));
}

/**
 * Sum of (score × weight) across every entry that matches a known
 * criterion. Unrounded — see constants/scoring.ts for why rounding is
 * deferred to calculateReviewTotal. Entries whose criterionId doesn't
 * match a provided criterion are silently skipped here (this is a pure
 * calculation function, not a validator — validateReviewScores is what
 * rejects an unknown criterionId with a structured error).
 */
export function calculateReviewWeightedScore(
  entries: Pick<ValidatedScoreEntry, "criterionId" | "score">[],
  criteria: Pick<ReviewCriterion, "id" | "weight">[],
): Prisma.Decimal {
  const weightById = new Map(criteria.map((c) => [c.id, toDecimal(c.weight)]));
  return entries.reduce((sum, entry) => {
    const weight = weightById.get(entry.criterionId);
    if (!weight) return sum;
    return sum.plus(calculateCriterionScore(entry.score, weight));
  }, new Decimal(0));
}

/**
 * The authoritative review total, per the framework's configured
 * scoring method. Only WEIGHTED_SUM is implemented (see
 * ReviewScoringMethod's doc comment in schema.prisma for why this covers
 * both weighted and unweighted scoring) — the switch is structured so a
 * future method is one new case, not a rewrite of this function's
 * signature or callers. Rounds to SCORE_DECIMAL_PLACES with
 * SCORE_ROUNDING_MODE — the only rounding step in the whole calculation.
 */
export function calculateReviewTotal(
  entries: Pick<ValidatedScoreEntry, "criterionId" | "score">[],
  criteria: Pick<ReviewCriterion, "id" | "weight">[],
  scoringMethod: ReviewScoringMethod,
): Prisma.Decimal {
  switch (scoringMethod) {
    case "WEIGHTED_SUM":
      return calculateReviewWeightedScore(entries, criteria).toDecimalPlaces(
        SCORE_DECIMAL_PLACES,
        SCORE_ROUNDING_MODE,
      );
    default:
      // Exhaustiveness guard — throws only if a future ReviewScoringMethod
      // value is added to the schema without a matching case here.
      throw new Error(`Unsupported scoring method: ${scoringMethod satisfies never}`);
  }
}

/**
 * The maximum a review under this framework could possibly score —
 * sum of (maxScore × weight) across active criteria. This is what
 * framework publish-validation checks against the review stage's
 * declared maxTotalScore (see domain/frameworkValidation.ts), and what a
 * score breakdown UI would show as "X out of Y" once one exists.
 */
export function calculateFrameworkMaxScore(
  criteria: Pick<ReviewCriterion, "maxScore" | "weight" | "isActive">[],
): Prisma.Decimal {
  return criteria
    .filter((c) => c.isActive)
    .reduce((sum, c) => sum.plus(calculateCriterionScore(c.maxScore, c.weight)), new Decimal(0));
}

/**
 * Per-criterion breakdown plus the authoritative total — what a review
 * detail screen would render once one exists, and what
 * recalculateReview compares against the persisted total to detect
 * drift (§14, §18).
 */
export function getReviewScoreBreakdown(
  entries: ValidatedScoreEntry[],
  criteria: ReviewCriterion[],
  scoringMethod: ReviewScoringMethod,
): ReviewScoreBreakdown {
  const entryByCriterionId = new Map(entries.map((e) => [e.criterionId, e]));

  const rows: CriterionBreakdown[] = criteria
    .filter((c) => c.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((criterion) => {
      const entry = entryByCriterionId.get(criterion.id);
      const rawScore = entry ? toDecimal(entry.score) : null;
      return {
        criterionId: criterion.id,
        code: criterion.code,
        label: criterion.label,
        weight: toDecimal(criterion.weight),
        maxScore: toDecimal(criterion.maxScore),
        rawScore,
        weightedContribution: rawScore ? calculateCriterionScore(rawScore, criterion.weight) : null,
        comment: entry?.comment ?? null,
      };
    });

  return {
    criteria: rows,
    rawScore: calculateReviewRawScore(entries),
    total: calculateReviewTotal(entries, criteria, scoringMethod),
    maxPossible: calculateFrameworkMaxScore(criteria),
  };
}
