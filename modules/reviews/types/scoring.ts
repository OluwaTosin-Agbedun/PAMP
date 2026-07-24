import type { Prisma } from "@/lib/generated/prisma/client";
import type { RatingScaleBand, ReviewCriterion } from "@/lib/generated/prisma/client";

/** A criterion together with the rating scale bands it's constrained to, if any. */
export type CriterionWithScale = ReviewCriterion & {
  ratingScale: { bands: RatingScaleBand[] } | null;
};

/** One score entry as submitted by a caller — before validation. */
export type ScoreEntryInput = {
  criterionId: string;
  score: Prisma.Decimal | number | string;
  comment?: string | null;
};

/** One score entry after validation, normalized to Decimal. */
export type ValidatedScoreEntry = {
  criterionId: string;
  score: Prisma.Decimal;
  comment: string | null;
};

export type ScoreValidationIssue = {
  criterionId?: string;
  code: string;
  message: string;
};

export type ScoreValidationResult =
  | { valid: true; entries: ValidatedScoreEntry[] }
  | { valid: false; issues: ScoreValidationIssue[] };

export type CriterionBreakdown = {
  criterionId: string;
  code: string;
  label: string;
  weight: Prisma.Decimal;
  maxScore: Prisma.Decimal;
  rawScore: Prisma.Decimal | null;
  weightedContribution: Prisma.Decimal | null;
  comment: string | null;
};

export type ReviewScoreBreakdown = {
  criteria: CriterionBreakdown[];
  rawScore: Prisma.Decimal;
  total: Prisma.Decimal;
  maxPossible: Prisma.Decimal;
};

export type FrameworkValidationIssue = {
  criterionId?: string;
  code: string;
  message: string;
};

export type FrameworkValidationResult =
  | { valid: true; totalConfiguredScore: Prisma.Decimal }
  | { valid: false; issues: FrameworkValidationIssue[] };
