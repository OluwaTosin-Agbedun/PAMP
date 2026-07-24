import { z } from "zod";

/**
 * External-input validation only (§22) — shape and type checking. This
 * is deliberately not where business rules like "score must be within
 * the criterion's range" live; that needs the criterion loaded from the
 * database and lives in modules/reviews/domain/validation.ts instead.
 *
 * None of these schemas accept a value the brief says must be
 * server-derived: no framework `status` (only publish/retire actions
 * change it), no `reviewerId`/`programmeId`/`cohortId` (derived from the
 * authenticated actor and the review stage), no calculated
 * total/weighted score, no submission timestamp.
 */

const decimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), { error: "Must be a plain decimal number" });

export const createReviewStageSchema = z.object({
  programmeId: z.string().min(1),
  cohortId: z.string().min(1).nullish(),
  name: z.string().trim().min(2, "Enter a stage name"),
  code: z
    .string()
    .trim()
    .min(2, "Enter a short stage code")
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, and underscores only"),
  description: z.string().trim().optional(),
  maxTotalScore: decimalString,
  sequenceOrder: z.number().int().min(0).default(0),
  opensAt: z.coerce.date().nullish(),
  closesAt: z.coerce.date().nullish(),
  commentsRequired: z.boolean().default(false),
  allCriteriaMandatory: z.boolean().default(true),
  allowPartialDraft: z.boolean().default(true),
});
export type CreateReviewStageInput = z.infer<typeof createReviewStageSchema>;

export const createReviewFrameworkSchema = z.object({
  reviewStageId: z.string().min(1),
  effectiveAt: z.coerce.date().nullish(),
});
export type CreateReviewFrameworkInput = z.infer<typeof createReviewFrameworkSchema>;

export const updateReviewFrameworkSchema = z.object({
  frameworkId: z.string().min(1),
  effectiveAt: z.coerce.date().nullish(),
});
export type UpdateReviewFrameworkInput = z.infer<typeof updateReviewFrameworkSchema>;

export const publishReviewFrameworkSchema = z.object({
  frameworkId: z.string().min(1),
});
export type PublishReviewFrameworkInput = z.infer<typeof publishReviewFrameworkSchema>;

export const retireReviewFrameworkSchema = z.object({
  frameworkId: z.string().min(1),
  reason: z.string().trim().min(1, "Enter a reason for retiring this framework").optional(),
});
export type RetireReviewFrameworkInput = z.infer<typeof retireReviewFrameworkSchema>;

export const createRatingScaleSchema = z.object({
  reviewFrameworkId: z.string().min(1),
  name: z.string().trim().min(2, "Enter a scale name"),
  description: z.string().trim().optional(),
  bands: z
    .array(
      z.object({
        value: decimalString,
        label: z.string().trim().min(1, "Enter a label for this band"),
        description: z.string().trim().optional(),
        behavioralAnchor: z.string().trim().optional(),
        evidenceExpectation: z.string().trim().optional(),
        displayOrder: z.number().int().min(0).default(0),
      }),
    )
    .min(1, "A rating scale needs at least one band"),
});
export type CreateRatingScaleInput = z.infer<typeof createRatingScaleSchema>;

export const createCriterionSchema = z.object({
  reviewFrameworkId: z.string().min(1),
  code: z
    .string()
    .trim()
    .min(1, "Enter a criterion code")
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, and underscores only"),
  label: z.string().trim().min(2, "Enter a criterion label"),
  description: z.string().trim().optional(),
  reviewerGuidance: z.string().trim().optional(),
  evidenceGuidance: z.string().trim().optional(),
  displayOrder: z.number().int().min(0).default(0),
  minScore: decimalString.default("0"),
  maxScore: decimalString,
  weight: decimalString.default("1"),
  isMandatory: z.boolean().default(true),
  isCommentMandatory: z.boolean().default(false),
  allowDecimalScores: z.boolean().default(true),
  ratingScaleId: z.string().min(1).nullish(),
});
export type CreateCriterionInput = z.infer<typeof createCriterionSchema>;

export const updateCriterionSchema = createCriterionSchema
  .omit({ reviewFrameworkId: true })
  .partial()
  .extend({
    criterionId: z.string().min(1),
    isActive: z.boolean().optional(),
  });
export type UpdateCriterionInput = z.infer<typeof updateCriterionSchema>;

const scoreEntrySchema = z.object({
  criterionId: z.string().min(1),
  score: decimalString,
  comment: z.string().trim().max(4000).nullish(),
});

export const saveDraftScoresSchema = z.object({
  reviewId: z.string().min(1),
  scores: z.array(scoreEntrySchema),
});
export type SaveDraftScoresInput = z.infer<typeof saveDraftScoresSchema>;

export const removeDraftScoreSchema = z.object({
  reviewId: z.string().min(1),
  criterionId: z.string().min(1),
});
export type RemoveDraftScoreInput = z.infer<typeof removeDraftScoreSchema>;

export const submitReviewSchema = z.object({
  reviewId: z.string().min(1),
  scores: z.array(scoreEntrySchema),
  comments: z.string().trim().max(8000).nullish(),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const reopenReviewSchema = z.object({
  reviewId: z.string().min(1),
  reason: z.string().trim().min(10, "Explain why this review is being reopened (at least 10 characters)"),
});
export type ReopenReviewInput = z.infer<typeof reopenReviewSchema>;
