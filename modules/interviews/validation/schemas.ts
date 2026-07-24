import { z } from "zod";

export const scheduleInterviewSchema = z.object({
  applicationId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.coerce.number().int().min(10).max(240).optional(),
  meetingLink: z.string().trim().max(500).optional(),
});
export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewSchema>;

export const reassignPanelistSchema = z.object({
  panelistId: z.string().min(1),
  newInterviewerId: z.string().min(1),
  reason: z.string().trim().min(10, "Explain why this reassignment is needed (at least 10 characters)").max(2000),
});
export type ReassignPanelistInput = z.infer<typeof reassignPanelistSchema>;

export const cancelPanelistSchema = z.object({
  panelistId: z.string().min(1),
  reason: z.string().trim().min(5, "Explain why this seat is being cancelled").max(2000),
});
export type CancelPanelistInput = z.infer<typeof cancelPanelistSchema>;

export const declareInterviewConflictSchema = z.object({
  interviewerId: z.string().min(1),
  applicationId: z.string().min(1),
  reason: z.string().trim().min(5, "Explain the conflict of interest").max(2000),
  expiresAt: z.string().datetime().optional().nullable(),
});
export type DeclareInterviewConflictInput = z.infer<typeof declareInterviewConflictSchema>;

export const setInterviewerCapacitySchema = z.object({
  interviewerId: z.string().min(1),
  programmeId: z.string().min(1),
  maxConcurrentInterviews: z.coerce.number().int().min(1).max(100),
  isAvailable: z.boolean(),
  unavailableReason: z.string().trim().max(500).optional().nullable(),
  unavailableUntil: z.string().datetime().optional().nullable(),
});
export type SetInterviewerCapacityInput = z.infer<typeof setInterviewerCapacitySchema>;

// ---------------------------------------------------------------------------
// Interview Workspace (Release 1 Module 2) — panellist scoring
// ---------------------------------------------------------------------------

const interviewScoreEntrySchema = z.object({
  criterionId: z.string().min(1),
  score: z.union([z.string(), z.number()]),
});

export const saveDraftInterviewScoresSchema = z.object({
  interviewScoreId: z.string().min(1),
  scores: z.array(interviewScoreEntrySchema),
});
export type SaveDraftInterviewScoresInput = z.infer<typeof saveDraftInterviewScoresSchema>;

// Addendum §2.3 — four structured comment fields, replacing the single
// freeform `comments` field.
const interviewScoreCommentField = z.string().trim().max(4000).optional().nullable();

// PAM-P 2026 Interview Score Sheet — a closed checkbox choice, not free text.
const interviewRecommendationSchema = z.enum([
  "STRONGLY_RECOMMEND",
  "RECOMMEND",
  "RESERVE",
  "NOT_RECOMMENDED",
  "INTEGRITY_HOLD",
]);

export const submitInterviewScoreSchema = z.object({
  interviewScoreId: z.string().min(1),
  scores: z.array(interviewScoreEntrySchema),
  overallAssessment: interviewScoreCommentField,
  strengths: interviewScoreCommentField,
  concerns: interviewScoreCommentField,
  recommendation: interviewRecommendationSchema.optional().nullable(),
  // PAM-P 2026 Interview Score Sheet — a panellist's own factual flag,
  // distinct from the INTEGRITY_HOLD recommendation option.
  integrityFlag: z.boolean().optional(),
});
export type SubmitInterviewScoreInput = z.infer<typeof submitInterviewScoreSchema>;

// ---------------------------------------------------------------------------
// Interview Scoring Revision (Addendum Module 2)
// ---------------------------------------------------------------------------

export const closeInterviewWithOverrideSchema = z.object({
  interviewId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(10, "Explain why this interview is being closed with three valid scores (at least 10 characters)")
    .max(2000),
});
export type CloseInterviewWithOverrideInput = z.infer<typeof closeInterviewWithOverrideSchema>;

// ---------------------------------------------------------------------------
// Interview Scheduling (Enterprise Functional Specification Addendum)
// ---------------------------------------------------------------------------

export const submitAvailabilitySchema = z.object({
  cohortId: z.string().min(1),
  type: z.enum(["AVAILABLE", "UNAVAILABLE", "LEAVE"]),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().trim().max(500).optional().nullable(),
});
export type SubmitAvailabilityInput = z.infer<typeof submitAvailabilitySchema>;

export const declineBookingSchema = z.object({
  interviewId: z.string().min(1),
  reason: z.string().trim().min(5, "Explain why this booking is being declined").max(2000),
});
export type DeclineBookingInput = z.infer<typeof declineBookingSchema>;

export const requestAnotherSlotSchema = z.object({
  interviewId: z.string().min(1),
  reason: z.string().trim().min(5, "Explain why the applicant needs to choose again").max(2000),
});
export type RequestAnotherSlotInput = z.infer<typeof requestAnotherSlotSchema>;

export const setTeamsLinkSchema = z.object({
  interviewId: z.string().min(1),
  link: z.string().trim().url("Enter a valid meeting link").max(1000),
});
export type SetTeamsLinkInput = z.infer<typeof setTeamsLinkSchema>;

// PAM-P 2026 Interview Score Sheet.
export const setInterviewModeSchema = z.object({
  interviewId: z.string().min(1),
  mode: z.enum(["VIRTUAL", "PHYSICAL", "HYBRID"]),
});
export type SetInterviewModeInput = z.infer<typeof setInterviewModeSchema>;

export const bookSlotSchema = z.object({
  token: z.string().min(1),
  slotId: z.string().min(1),
});
export type BookSlotInput = z.infer<typeof bookSlotSchema>;

// Interview Configuration §6/§4.6 — manual attendance recording.
export const recordAttendanceSchema = z.object({
  interviewId: z.string().min(1),
  status: z.enum(["PRESENT", "LATE", "ABSENT", "TECHNICAL_ISSUE", "RESCHEDULED", "CANCELLED"]),
  note: z.string().trim().max(2000).optional(),
});
export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;

// ---------------------------------------------------------------------------
// Microsoft Teams Interview Integration
// ---------------------------------------------------------------------------

export const createTeamsMeetingSchema = z.object({
  interviewId: z.string().min(1),
});
export type CreateTeamsMeetingInput = z.infer<typeof createTeamsMeetingSchema>;

export const retryTeamsMeetingSyncSchema = z.object({
  interviewId: z.string().min(1),
});
export type RetryTeamsMeetingSyncInput = z.infer<typeof retryTeamsMeetingSyncSchema>;

export const rescheduleInterviewSchema = z.object({
  interviewId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  reason: z.string().trim().min(5, "Explain why this interview is being rescheduled").max(2000),
});
export type RescheduleInterviewInput = z.infer<typeof rescheduleInterviewSchema>;

export const cancelInterviewSchema = z.object({
  interviewId: z.string().min(1),
  reason: z.string().trim().min(5, "Explain why this interview is being cancelled").max(2000),
});
export type CancelInterviewInput = z.infer<typeof cancelInterviewSchema>;

// ---------------------------------------------------------------------------
// Interview Questions (Addendum Module 3)
// ---------------------------------------------------------------------------

const interviewQuestionCategorySchema = z.enum(["MANDATORY", "PATHWAY", "SITUATIONAL", "ADDITIONAL_BANK"]);
const interviewPathwaySchema = z.enum([
  "ENTREPRENEURSHIP_ENTERPRISE",
  "PUBLIC_PRIVATE_SECTOR_LEADERSHIP",
  "ACADEMIA_ADVANCED_STUDIES",
]);

/** category=PATHWAY requires a pathway; every other category requires it to be absent. */
function refinePathwayMatchesCategory<T extends { category: z.infer<typeof interviewQuestionCategorySchema>; pathway?: z.infer<typeof interviewPathwaySchema> | null }>(
  data: T,
  ctx: z.RefinementCtx,
) {
  if (data.category === "PATHWAY" && !data.pathway) {
    ctx.addIssue({ code: "custom", message: "Select a pathway for a pathway-specific question.", path: ["pathway"] });
  }
  if (data.category !== "PATHWAY" && data.pathway) {
    ctx.addIssue({ code: "custom", message: "Only pathway-specific questions may have a pathway.", path: ["pathway"] });
  }
}

export const createInterviewQuestionSchema = z
  .object({
    text: z.string().trim().min(3, "Enter the question text").max(1000),
    category: interviewQuestionCategorySchema,
    pathway: interviewPathwaySchema.optional().nullable(),
  })
  .superRefine(refinePathwayMatchesCategory);
export type CreateInterviewQuestionInput = z.infer<typeof createInterviewQuestionSchema>;

export const updateInterviewQuestionSchema = z
  .object({
    questionId: z.string().min(1),
    text: z.string().trim().min(3, "Enter the question text").max(1000),
    category: interviewQuestionCategorySchema,
    pathway: interviewPathwaySchema.optional().nullable(),
  })
  .superRefine(refinePathwayMatchesCategory);
export type UpdateInterviewQuestionInput = z.infer<typeof updateInterviewQuestionSchema>;

export const setInterviewQuestionActiveSchema = z.object({
  questionId: z.string().min(1),
  isActive: z.boolean(),
});
export type SetInterviewQuestionActiveInput = z.infer<typeof setInterviewQuestionActiveSchema>;

export const startInterviewSessionSchema = z.object({
  interviewId: z.string().min(1),
});
export type StartInterviewSessionInput = z.infer<typeof startInterviewSessionSchema>;

export const endInterviewSessionSchema = z.object({
  interviewId: z.string().min(1),
});
export type EndInterviewSessionInput = z.infer<typeof endInterviewSessionSchema>;

export const selectAdditionalQuestionSchema = z.object({
  interviewId: z.string().min(1),
  questionId: z.string().min(1),
});
export type SelectAdditionalQuestionInput = z.infer<typeof selectAdditionalQuestionSchema>;
