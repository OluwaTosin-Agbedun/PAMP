import { z } from "zod";

export const generateFinalRankingSchema = z.object({
  cohortId: z.string().min(1),
});
export type GenerateFinalRankingInput = z.infer<typeof generateFinalRankingSchema>;

export const approveFinalRankingSchema = z.object({
  rankingSnapshotId: z.string().min(1),
});
export type ApproveFinalRankingInput = z.infer<typeof approveFinalRankingSchema>;

export const reopenFinalRankingSchema = z.object({
  rankingSnapshotId: z.string().min(1),
  reason: z.string().trim().min(10, "Explain why this approved ranking is being reopened (at least 10 characters)").max(2000),
});
export type ReopenFinalRankingInput = z.infer<typeof reopenFinalRankingSchema>;

export const resolveTieSchema = z.object({
  tieResolutionId: z.string().min(1),
  justification: z.string().trim().min(10, "Record the committee's justification (at least 10 characters)").max(4000),
  resolvedRanks: z
    .array(z.object({ applicationId: z.string().min(1), resolvedRank: z.coerce.number().int().min(1) }))
    .min(2, "A tie involves at least two applications"),
});
export type ResolveTieInput = z.infer<typeof resolveTieSchema>;
