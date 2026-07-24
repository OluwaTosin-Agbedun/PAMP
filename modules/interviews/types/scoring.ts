import type { Prisma } from "@/lib/generated/prisma/client";
import type { InterviewCriterion } from "@/lib/generated/prisma/client";

/**
 * Deliberately flatter than modules/reviews/types/scoring.ts's
 * CriterionWithScale — InterviewCriterion has no rating scale, mandatory-
 * comment flag, or decimal-policy field (see docs/INTERVIEW_WORKSPACE.md's
 * "Scope boundary with Module 3" for why: those are Module 3's
 * "Configurable interview framework"/"Mandatory questions" charter, not
 * this module's).
 */

/** One score entry as submitted by a caller — before validation. */
export type InterviewScoreEntryInput = {
  criterionId: string;
  score: Prisma.Decimal | number | string;
};

/** One score entry after validation, normalized to Decimal. */
export type ValidatedInterviewScoreEntry = {
  criterionId: string;
  score: Prisma.Decimal;
};

export type InterviewScoreValidationIssue = {
  criterionId?: string;
  code: string;
  message: string;
};

export type InterviewScoreValidationResult =
  | { valid: true; entries: ValidatedInterviewScoreEntry[] }
  | { valid: false; issues: InterviewScoreValidationIssue[] };

export type InterviewCriterionBreakdown = {
  criterionId: string;
  label: string;
  weight: Prisma.Decimal;
  maxScore: Prisma.Decimal;
  rawScore: Prisma.Decimal | null;
  weightedContribution: Prisma.Decimal | null;
};

export type InterviewScoreBreakdown = {
  criteria: InterviewCriterionBreakdown[];
  rawScore: Prisma.Decimal;
  total: Prisma.Decimal;
  maxPossible: Prisma.Decimal;
};

export type { InterviewCriterion };
