import type { Prisma } from "@/lib/generated/prisma/client";
import type { InterviewCriterion } from "@/lib/generated/prisma/client";

import { toDecimal } from "./interviewScoring";
import type {
  InterviewScoreEntryInput,
  InterviewScoreValidationIssue,
  InterviewScoreValidationResult,
  ValidatedInterviewScoreEntry,
} from "../types/scoring";

/**
 * Business-rule validation for interview scores — the interview-side
 * counterpart to modules/reviews/domain/validation.ts, deliberately
 * narrower. `InterviewCriterion` has no decimal-policy, mandatory-
 * comment, or rating-scale field (Module 3's "Configurable interview
 * framework"/"Mandatory questions" charter, not this module's — see
 * docs/INTERVIEW_WORKSPACE.md), so this only checks what the current
 * schema can actually express: a score is a finite number, in range,
 * against a known active criterion.
 *
 * Completeness at submit time is intentionally minimal — "at least one
 * criterion scored" — rather than "every criterion scored" (Review's
 * `allCriteriaMandatory`/per-criterion `isMandatory`). Which questions
 * are truly mandatory is exactly what Module 3 is asked to implement;
 * hard-requiring every criterion here would invent that answer instead
 * of leaving it for Module 3 to configure.
 */

const MIN_SCORE = 0;

export function validateInterviewCriterionScore(
  criterion: Pick<InterviewCriterion, "id" | "label" | "maxScore">,
  entry: InterviewScoreEntryInput,
): InterviewScoreValidationIssue[] {
  const issues: InterviewScoreValidationIssue[] = [];
  const criterionId = criterion.id;

  let score: Prisma.Decimal;
  try {
    score = toDecimal(entry.score);
    if (!score.isFinite()) throw new Error("not finite");
  } catch {
    issues.push({ criterionId, code: "INVALID_SCORE_TYPE", message: `Score for "${criterion.label}" must be a number.` });
    return issues;
  }

  const max = toDecimal(criterion.maxScore);
  if (score.lessThan(MIN_SCORE) || score.greaterThan(max)) {
    issues.push({
      criterionId,
      code: "SCORE_OUT_OF_RANGE",
      message: `Score for "${criterion.label}" must be between 0 and ${max.toString()}.`,
    });
  }

  return issues;
}

export function validateInterviewScores(
  criteria: InterviewCriterion[],
  entries: InterviewScoreEntryInput[],
  opts: { mode: "draft" | "submit" },
): InterviewScoreValidationResult {
  const issues: InterviewScoreValidationIssue[] = [];
  const criterionById = new Map(criteria.map((c) => [c.id, c]));
  const seenCriterionIds = new Set<string>();
  const validated: ValidatedInterviewScoreEntry[] = [];

  for (const entry of entries) {
    if (seenCriterionIds.has(entry.criterionId)) {
      issues.push({
        criterionId: entry.criterionId,
        code: "DUPLICATE_CRITERION_SCORE",
        message: "Each criterion can only be scored once per interview.",
      });
      continue;
    }
    seenCriterionIds.add(entry.criterionId);

    const criterion = criterionById.get(entry.criterionId);
    if (!criterion) {
      issues.push({
        criterionId: entry.criterionId,
        code: "UNKNOWN_CRITERION",
        message: "That question doesn't belong to this cohort's interview framework.",
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

    const entryIssues = validateInterviewCriterionScore(criterion, entry);
    if (entryIssues.length > 0) {
      issues.push(...entryIssues);
      continue;
    }

    validated.push({ criterionId: entry.criterionId, score: toDecimal(entry.score) });
  }

  if (opts.mode === "submit" && validated.length === 0) {
    issues.push({
      code: "NO_SCORES_ENTERED",
      message: "Score at least one question before submitting.",
    });
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }
  return { valid: true, entries: validated };
}
