import { z } from "zod";

export const createRecommendationSchema = z.object({
  applicationId: z.string().min(1),
  recommendedIsEligible: z.boolean(),
  reason: z.string().trim().min(10, "Explain the recommendation (at least 10 characters)").max(2000),
});
export type CreateRecommendationInput = z.infer<typeof createRecommendationSchema>;

export const resolveRecommendationSchema = z.object({
  recommendationId: z.string().min(1),
  executionNote: z.string().trim().max(2000).optional(),
});
export type ResolveRecommendationInput = z.infer<typeof resolveRecommendationSchema>;
