import { z } from "zod";

/**
 * External-input validation for the review assignment engine (Phase 3B) —
 * see modules/reviews/validation/schemas.ts's doc comment for what
 * belongs here vs. in the domain layer. Nothing server-derived is
 * accepted: no `status`, no `assignedMethod`, no `source` (self-declared
 * vs. admin-recorded is derived from whether the actor matches
 * `reviewerId`, not accepted as input).
 */

export const manualAssignReviewerSchema = z.object({
  applicationId: z.string().min(1),
  reviewerId: z.string().min(1),
  slot: z.enum(["FIRST", "SECOND", "THIRD"]),
});
export type ManualAssignReviewerInput = z.infer<typeof manualAssignReviewerSchema>;

export const cancelAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  reason: z.string().trim().min(10, "Explain why this assignment is being cancelled (at least 10 characters)"),
});
export type CancelAssignmentInput = z.infer<typeof cancelAssignmentSchema>;

export const reassignAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  newReviewerId: z.string().min(1),
  reason: z.string().trim().min(10, "Explain why this assignment is being reassigned (at least 10 characters)"),
});
export type ReassignAssignmentInput = z.infer<typeof reassignAssignmentSchema>;

export const declareConflictOfInterestSchema = z.object({
  reviewerId: z.string().min(1),
  applicationId: z.string().min(1),
  reason: z.string().trim().min(5, "Enter a reason for this conflict of interest"),
  expiresAt: z.coerce.date().nullish(),
});
export type DeclareConflictOfInterestInput = z.infer<typeof declareConflictOfInterestSchema>;

export const setReviewerCapacitySchema = z.object({
  reviewerId: z.string().min(1),
  programmeId: z.string().min(1),
  maxConcurrentAssignments: z.number().int().min(1).optional(),
  isAvailable: z.boolean().optional(),
  unavailableReason: z.string().trim().max(2000).nullish(),
  unavailableUntil: z.coerce.date().nullish(),
});
export type SetReviewerCapacityInput = z.infer<typeof setReviewerCapacitySchema>;
