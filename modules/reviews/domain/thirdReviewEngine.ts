import { Prisma } from "@/lib/generated/prisma/client";

import { SCORE_DECIMAL_PLACES, SCORE_ROUNDING_MODE } from "../constants/scoring";
import { toDecimal } from "./scoring";

const { Decimal } = Prisma;

/**
 * Pure calculations behind automatic third-review escalation (§9). No
 * I/O — the service layer loads the two submitted `Review.totalScore`
 * values and the framework's max possible score, then calls in here.
 */

/**
 * Divergence is expressed in **percentage points of the framework's max
 * possible score**, not raw score points — "13 percentage points" (§2)
 * is only a well-defined, framework-agnostic threshold this way: a
 * 13-point gap means something different on a 60-point framework than a
 * 100-point one, but a 13-*percentage-point* gap means the same thing on
 * either, which is what "reusable for future programmes and review
 * stages" (§1) requires. See docs/THIRD_REVIEW_ENGINE.md for the worked
 * example.
 */
export function calculateDivergencePercent(
  score1: Prisma.Decimal | number | string,
  score2: Prisma.Decimal | number | string,
  maxPossibleScore: Prisma.Decimal | number | string,
): Prisma.Decimal {
  const max = toDecimal(maxPossibleScore);
  if (max.lessThanOrEqualTo(0)) {
    throw new Error("maxPossibleScore must be positive to compute a percentage divergence.");
  }
  const pct1 = toDecimal(score1).dividedBy(max).times(100);
  const pct2 = toDecimal(score2).dividedBy(max).times(100);
  return pct1.minus(pct2).abs();
}

export function exceedsDivergenceThreshold(
  divergencePercent: Prisma.Decimal,
  thresholdPercent: Prisma.Decimal | number | string,
): boolean {
  return divergencePercent.greaterThan(toDecimal(thresholdPercent));
}

/**
 * §2's resolution formula: the final score is the average of the third
 * reviewer's score and whichever of Reviewer 1/Reviewer 2 scored lower.
 * Rounds once, at the end — same rounding strategy as
 * `calculateReviewTotal` (docs/SCORE_CALCULATION_RULES.md).
 */
export function calculateFinalScoreAfterThirdReview(
  score1: Prisma.Decimal | number | string,
  score2: Prisma.Decimal | number | string,
  thirdReviewerScore: Prisma.Decimal | number | string,
): Prisma.Decimal {
  const lower = Decimal.min(toDecimal(score1), toDecimal(score2));
  return lower.plus(toDecimal(thirdReviewerScore)).dividedBy(2).toDecimalPlaces(SCORE_DECIMAL_PLACES, SCORE_ROUNDING_MODE);
}
