import type { RatingScale, RatingScaleBand, ReviewCriterion, ReviewFramework, ReviewStage } from "@/lib/generated/prisma/client";

import { calculateFrameworkMaxScore, toDecimal } from "./scoring";
import type { FrameworkValidationIssue, FrameworkValidationResult } from "../types/scoring";

type ScaleWithBands = RatingScale & { bands: RatingScaleBand[] };

/**
 * Everything a framework must satisfy before it can move DRAFT →
 * PUBLISHED (§8). Pure — takes already-loaded rows, returns a structured
 * result rather than throwing, so a caller (the publish service) can
 * decide whether to translate the first issue into a thrown
 * `InvalidReviewFrameworkError` or, for an eventual admin UI, show every
 * issue at once. Every check below maps to one bullet in §8; where a
 * bullet isn't a separate check, the comment says why (usually: it's
 * already implied by another check here).
 */
export function validateFrameworkForPublish(
  framework: ReviewFramework,
  stage: ReviewStage,
  criteria: ReviewCriterion[],
  ratingScales: ScaleWithBands[],
): FrameworkValidationResult {
  const issues: FrameworkValidationIssue[] = [];

  if (framework.status !== "DRAFT") {
    issues.push({
      code: "FRAMEWORK_NOT_DRAFT",
      message: "Only a draft framework can be published — a published or retired one is locked.",
    });
  }

  if (framework.programmeId !== stage.programmeId || framework.cohortId !== stage.cohortId) {
    issues.push({
      code: "PROGRAMME_COHORT_MISMATCH",
      message: "This framework's programme/cohort no longer match its review stage.",
    });
  }

  const activeCriteria = criteria.filter((c) => c.isActive);
  if (activeCriteria.length === 0) {
    issues.push({ code: "NO_ACTIVE_CRITERIA", message: "A framework needs at least one active criterion to publish." });
  }

  const codesSeen = new Set<string>();
  const scaleById = new Map(ratingScales.map((s) => [s.id, s]));

  for (const criterion of activeCriteria) {
    if (codesSeen.has(criterion.code)) {
      issues.push({
        criterionId: criterion.id,
        code: "DUPLICATE_CRITERION_CODE",
        message: `Criterion code "${criterion.code}" is used more than once in this framework.`,
      });
    }
    codesSeen.add(criterion.code);

    if (criterion.displayOrder < 0) {
      issues.push({ criterionId: criterion.id, code: "INVALID_DISPLAY_ORDER", message: `"${criterion.label}" has a negative display order.` });
    }

    const min = toDecimal(criterion.minScore);
    const max = toDecimal(criterion.maxScore);
    if (min.greaterThan(max)) {
      issues.push({ criterionId: criterion.id, code: "MIN_EXCEEDS_MAX", message: `"${criterion.label}"'s minimum score exceeds its maximum.` });
    }
    if (!max.greaterThan(0)) {
      issues.push({ criterionId: criterion.id, code: "MAX_SCORE_NOT_POSITIVE", message: `"${criterion.label}"'s maximum score must be positive.` });
    }
    if (!toDecimal(criterion.weight).greaterThan(0)) {
      issues.push({ criterionId: criterion.id, code: "INVALID_WEIGHT", message: `"${criterion.label}"'s weight must be positive.` });
    }

    if (criterion.isMandatory && !criterion.reviewerGuidance?.trim()) {
      issues.push({
        criterionId: criterion.id,
        code: "MISSING_REVIEWER_GUIDANCE",
        message: `"${criterion.label}" is mandatory and needs reviewer guidance before publishing.`,
      });
    }

    if (criterion.ratingScaleId) {
      const scale = scaleById.get(criterion.ratingScaleId);
      if (!scale || scale.bands.length === 0) {
        issues.push({
          criterionId: criterion.id,
          code: "MISSING_RATING_SCALE",
          message: `"${criterion.label}" references a rating scale with no bands configured.`,
        });
      } else {
        const outOfRange = scale.bands.some((band) => {
          const value = toDecimal(band.value);
          return value.lessThan(min) || value.greaterThan(max);
        });
        if (outOfRange) {
          issues.push({
            criterionId: criterion.id,
            code: "SCALE_OUT_OF_CRITERION_RANGE",
            message: `"${criterion.label}"'s rating scale has a band value outside its [${min.toString()}, ${max.toString()}] range.`,
          });
        }
      }
    }
  }

  const totalConfiguredScore = calculateFrameworkMaxScore(activeCriteria);
  const stageMax = toDecimal(stage.maxTotalScore);
  if (!totalConfiguredScore.equals(stageMax)) {
    issues.push({
      code: "TOTAL_MISMATCH",
      message: `Configured total (${totalConfiguredScore.toString()}) does not match the review stage's maximum (${stageMax.toString()}).`,
    });
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }
  return { valid: true, totalConfiguredScore };
}
