import { z } from "zod";

export const recordApprovalStageDecisionSchema = z
  .object({
    rankingSnapshotId: z.string().min(1),
    stage: z.enum(["TOP_70", "TOP_60", "FINAL_SELECTION", "VERIFICATION_CONFIRMATION"]),
    decision: z.enum(["APPROVED", "REJECTED"]),
    comment: z.string().trim().max(4000).optional(),
  })
  .refine((input) => input.decision !== "REJECTED" || !!input.comment, {
    message: "A comment is required when rejecting a stage.",
    path: ["comment"],
  });
export type RecordApprovalStageDecisionInput = z.infer<typeof recordApprovalStageDecisionSchema>;
