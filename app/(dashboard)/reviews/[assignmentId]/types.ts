/**
 * Plain, JSON-serializable view models for the scoring UI — Prisma
 * `Decimal` values are never passed across the Server → Client boundary
 * (they're class instances, not plain objects Next can serialize), so
 * page.tsx converts every Decimal field to a string before handing data
 * to a Client Component.
 */

export type RatingScaleBandViewModel = {
  value: string;
  label: string;
  description: string | null;
  behavioralAnchor: string | null;
};

export type CriterionViewModel = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  reviewerGuidance: string | null;
  evidenceGuidance: string | null;
  displayOrder: number;
  minScore: string;
  maxScore: string;
  weight: string;
  isMandatory: boolean;
  isCommentMandatory: boolean;
  allowDecimalScores: boolean;
  isActive: boolean;
  ratingScale: { bands: RatingScaleBandViewModel[] } | null;
};

export type ScoreViewModel = {
  criterionId: string;
  score: string;
  comment: string | null;
};
