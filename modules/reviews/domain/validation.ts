import type { Prisma } from "@/lib/generated/prisma/client";

import type {
  CriterionWithScale,
  ScoreEntryInput,
  ScoreValidationIssue,
  ScoreValidationResult,
  ValidatedScoreEntry,
} from "../types/scoring";
import { toDecimal } from "./scoring";

/**
 * Business-rule validation for one score against the criterion it's for
 * — distinct from the Zod schemas in modules/reviews/validation/, which
 * only check the *shape* of a request body. This is where the actual
 * criterion configuration (range, decimal policy, rating scale, mandatory
 * comment) is enforced, and it needs the criterion loaded from the
 * database to do it — Zod alone can't know a criterion's maxScore.
 *
 * `mode` controls only whether a *missing* mandatory comment is
 * rejected — draft saves may omit it, submission may not (§12). Range,
 * decimal-policy, and rating-scale violations are rejected in both
 * modes: an out-of-range score is never valid, draft or not.
 */
export function validateCriterionScore(
  criterion: CriterionWithScale,
  entry: ScoreEntryInput,
  opts: { mode: "draft" | "submit" },
): ScoreValidationIssue[] {
  const issues: ScoreValidationIssue[] = [];
  const criterionId = criterion.id;

  let score: Prisma.Decimal;
  try {
    score = toDecimal(entry.score);
    if (!score.isFinite()) throw new Error("not finite");
  } catch {
    issues.push({ criterionId, code: "INVALID_SCORE_TYPE", message: `Score for "${criterion.label}" must be a number.` });
    return issues;
  }

  const min = toDecimal(criterion.minScore);
  const max = toDecimal(criterion.maxScore);
  if (score.lessThan(min) || score.greaterThan(max)) {
    issues.push({
      criterionId,
      code: "SCORE_OUT_OF_RANGE",
      message: `Score for "${criterion.label}" must be between ${min.toString()} and ${max.toString()}.`,
    });
  }

  if (!criterion.allowDecimalScores && !score.isInteger()) {
    issues.push({
      criterionId,
      code: "DECIMAL_NOT_ALLOWED",
      message: `"${criterion.label}" only accepts whole-number scores.`,
    });
  }

  if (criterion.ratingScaleId) {
    const bandValues = criterion.ratingScale?.bands.map((b) => toDecimal(b.value)) ?? [];
    const matchesBand = bandValues.some((band) => band.equals(score));
    if (!matchesBand) {
      issues.push({
        criterionId,
        code: "SCORE_NOT_ON_SCALE",
        message: `Score for "${criterion.label}" must match one of its rating scale's values.`,
      });
    }
  }

  if (opts.mode === "submit" && criterion.isCommentMandatory && !entry.comment?.trim()) {
    issues.push({
      criterionId,
      code: "COMMENT_REQUIRED",
      message: `"${criterion.label}" requires a comment.`,
    });
  }

  return issues;
}

/**
 * The aggregate validator behind both draft saves and submission (§12).
 * Structural problems (duplicate criterion, criterion from another
 * framework, invalid type) are rejected in every mode — a draft is
 * allowed to be *incomplete*, never *wrong*. Completeness (every
 * mandatory criterion scored, required comments present) is only
 * enforced when `mode: "submit"`.
 */
export function validateReviewScores(
  criteria: CriterionWithScale[],
  entries: ScoreEntryInput[],
  opts: {
    mode: "draft" | "submit";
    allCriteriaMandatory: boolean;
    overallCommentRequired?: boolean;
    overallComment?: string | null;
  },
): ScoreValidationResult {
  const issues: ScoreValidationIssue[] = [];
  const criterionById = new Map(criteria.map((c) => [c.id, c]));
  const seenCriterionIds = new Set<string>();
  const validated: ValidatedScoreEntry[] = [];

  for (const entry of entries) {
    if (seenCriterionIds.has(entry.criterionId)) {
      issues.push({
        criterionId: entry.criterionId,
        code: "DUPLICATE_CRITERION_SCORE",
        message: "Each criterion can only be scored once per review.",
      });
      continue;
    }
    seenCriterionIds.add(entry.criterionId);

    const criterion = criterionById.get(entry.criterionId);
    if (!criterion) {
      issues.push({
        criterionId: entry.criterionId,
        code: "UNKNOWN_CRITERION",
        message: "That criterion doesn't belong to this review's framework.",
      });
      continue;
    }
    if (!criterion.isActive) {
      issues.push({
        criterionId: entry.criterionId,
        code: "CRITERION_INACTIVE",
        message: `"${criterion.label}" is not active in this framework.`,
      });
      continue;
    }

    const entryIssues = validateCriterionScore(criterion, entry, { mode: opts.mode });
    if (entryIssues.length > 0) {
      issues.push(...entryIssues);
      continue;
    }

    validated.push({ criterionId: entry.criterionId, score: toDecimal(entry.score), comment: entry.comment ?? null });
  }

  if (opts.mode === "submit") {
    const activeCriteria = criteria.filter((c) => c.isActive);
    for (const criterion of activeCriteria) {
      const mandatory = opts.allCriteriaMandatory || criterion.isMandatory;
      if (mandatory && !seenCriterionIds.has(criterion.id)) {
        issues.push({
          criterionId: criterion.id,
          code: "MISSING_MANDATORY_SCORE",
          message: `"${criterion.label}" requires a score before this review can be submitted.`,
        });
      }
    }

    if (opts.overallCommentRequired && !opts.overallComment?.trim()) {
      issues.push({ code: "OVERALL_COMMENT_REQUIRED", message: "An overall review comment is required." });
    }
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }
  return { valid: true, entries: validated };
}
