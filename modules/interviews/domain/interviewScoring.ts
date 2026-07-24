import { Prisma } from "@/lib/generated/prisma/client";
import type { InterviewCriterion } from "@/lib/generated/prisma/client";

import { SCORE_DECIMAL_PLACES, SCORE_ROUNDING_MODE } from "@/modules/reviews/constants/scoring";
import { calculateCriterionScore, calculateFrameworkMaxScore, calculateReviewRawScore, calculateReviewWeightedScore, toDecimal } from "@/modules/reviews/domain/scoring";

import type { InterviewCriterionBreakdown, InterviewScoreBreakdown, ValidatedInterviewScoreEntry } from "../types/scoring";

/**
 * Deliberately reuses modules/reviews/domain/scoring.ts's pure functions
 * rather than reimplementing the same maths — `calculateCriterionScore`,
 * `calculateReviewRawScore`, `calculateReviewWeightedScore`, and
 * `calculateFrameworkMaxScore` are all generic over `{id, weight}` /
 * `{score}` shaped inputs, and `InterviewCriterion` has the exact fields
 * (`weight`, `maxScore`, `isActive`) those functions need — no interview-
 * flavoured copy exists. `calculateReviewTotal`'s own switch on
 * `ReviewScoringMethod` isn't reused directly (InterviewCriterion has no
 * scoring-method field to switch on — Module 3's "configurable interview
 * framework" charter, not this module's) — weighted-sum is the only
 * implemented method on the review side too, so this module calls the
 * weighted-sum calculation directly rather than inventing a method enum
 * that doesn't exist yet.
 */

export { toDecimal };

/** The authoritative per-panelist interview total: sum(score × weight), rounded once. */
export function calculateInterviewTotal(
  entries: Pick<ValidatedInterviewScoreEntry, "criterionId" | "score">[],
  criteria: Pick<InterviewCriterion, "id" | "weight">[],
): Prisma.Decimal {
  return calculateReviewWeightedScore(entries, criteria).toDecimalPlaces(SCORE_DECIMAL_PLACES, SCORE_ROUNDING_MODE);
}

export function calculateInterviewMaxScore(criteria: Pick<InterviewCriterion, "maxScore" | "weight" | "isActive">[]): Prisma.Decimal {
  return calculateFrameworkMaxScore(criteria);
}

/** Per-criterion breakdown plus the authoritative total, for the read-only summary once a score is submitted. */
export function getInterviewScoreBreakdown(
  entries: ValidatedInterviewScoreEntry[],
  criteria: InterviewCriterion[],
): InterviewScoreBreakdown {
  const entryByCriterionId = new Map(entries.map((e) => [e.criterionId, e]));

  const rows: InterviewCriterionBreakdown[] = criteria
    .filter((c) => c.isActive)
    .sort((a, b) => a.order - b.order)
    .map((criterion) => {
      const entry = entryByCriterionId.get(criterion.id);
      const rawScore = entry ? toDecimal(entry.score) : null;
      return {
        criterionId: criterion.id,
        label: criterion.label,
        weight: toDecimal(criterion.weight),
        maxScore: toDecimal(criterion.maxScore),
        rawScore,
        weightedContribution: rawScore ? calculateCriterionScore(rawScore, criterion.weight) : null,
      };
    });

  return {
    criteria: rows,
    rawScore: calculateReviewRawScore(entries),
    total: calculateInterviewTotal(entries, criteria),
    maxPossible: calculateInterviewMaxScore(criteria),
  };
}
