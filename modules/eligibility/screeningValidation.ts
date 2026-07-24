import { z } from "zod";

export const assignScreenerSchema = z.object({
  applicationId: z.string().min(1),
  screenerId: z.string().min(1),
});
export type AssignScreenerInput = z.infer<typeof assignScreenerSchema>;

const checklistSectionSchema = z.enum(["DOCUMENT", "BASELINE", "INTEGRITY"]);
const checklistItemStatusSchema = z.enum(["PASS", "FAIL", "CLARIFY", "CLEAR", "FLAG"]);

export const updateChecklistItemSchema = z.object({
  applicationId: z.string().min(1),
  section: checklistSectionSchema,
  itemKey: z.string().min(1),
  status: checklistItemStatusSchema.nullable(),
  comment: z.string().trim().max(2000).optional().nullable(),
});
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;

const decisionSchema = z.object({
  applicationId: z.string().min(1),
  reasonForDecision: z.string().trim().min(5, "Explain the decision (at least 5 characters)").max(2000),
});

export const markEligibleSchema = decisionSchema.extend({ secondReviewRequired: z.boolean().optional() });
export type MarkEligibleInput = z.infer<typeof markEligibleSchema>;

export const requestClarificationSchema = z.object({
  applicationId: z.string().min(1),
  outstandingClarification: z.string().trim().min(5, "Specify what requires clarification (at least 5 characters)").max(2000),
});
export type RequestClarificationInput = z.infer<typeof requestClarificationSchema>;

export const markIneligibleSchema = decisionSchema;
export type MarkIneligibleInput = z.infer<typeof markIneligibleSchema>;

export const escalateSchema = decisionSchema;
export type EscalateInput = z.infer<typeof escalateSchema>;

export const markDisqualifiedSchema = z.object({
  applicationId: z.string().min(1),
  integrityNote: z.string().trim().min(5, "Record the integrity reason (at least 5 characters)").max(2000),
});
export type MarkDisqualifiedInput = z.infer<typeof markDisqualifiedSchema>;

export const secondReviewSchema = z.object({
  applicationId: z.string().min(1),
  note: z.string().trim().max(2000).optional().nullable(),
});
export type SecondReviewInput = z.infer<typeof secondReviewSchema>;

export const reopenScreeningSchema = z.object({
  applicationId: z.string().min(1),
  reason: z.string().trim().min(10, "Explain why this decision is being reopened (at least 10 characters)").max(2000),
});
export type ReopenScreeningInput = z.infer<typeof reopenScreeningSchema>;

export const extendClarificationDeadlineSchema = z.object({
  applicationId: z.string().min(1),
  additionalHours: z.number().int().min(1).max(720).optional(),
  reason: z.string().trim().min(10, "Explain why the deadline is being extended (at least 10 characters)").max(2000),
});
export type ExtendClarificationDeadlineInput = z.infer<typeof extendClarificationDeadlineSchema>;

export const resolveDuplicateSchema = z.object({
  applicationId: z.string().min(1),
  duplicateOfApplicationId: z.string().min(1),
  note: z.string().trim().min(5, "Explain the duplicate resolution (at least 5 characters)").max(2000),
});
export type ResolveDuplicateInput = z.infer<typeof resolveDuplicateSchema>;
