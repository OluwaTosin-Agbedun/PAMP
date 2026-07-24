import { z } from "zod";

/**
 * §7.7 Dashboard Filters. `reviewerId`/`panellistId` filter *workload
 * counts* only (how many assignments/interviews a person has) — never a
 * route to that person's individual scores or comments, which stay
 * behind `REVIEW_SCORES_VIEW`/`INTERVIEW_SCORES_VIEW_ALL` exactly as
 * everywhere else in this codebase. `sector` is deliberately not a
 * filter field: no `sector` value exists anywhere in the data model
 * (confirmed by search) to filter by.
 */
export const analyticsFiltersSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  stage: z.enum(["IMPORTED", "UNDER_REVIEW", "INTERVIEW", "COMMITTEE_REVIEW", "EXECUTIVE_APPROVAL", "ADMISSIONS", "CLOSED"]).optional(),
  eligibilityStatus: z.enum(["PENDING", "ELIGIBLE", "INELIGIBLE", "CLARIFICATION_REQUIRED", "DISQUALIFIED"]).optional(),
  pathway: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  zone: z.string().trim().min(1).optional(),
  gender: z.string().trim().min(1).optional(),
  reviewerId: z.string().trim().min(1).optional(),
  panellistId: z.string().trim().min(1).optional(),
});
export type AnalyticsFiltersInput = z.infer<typeof analyticsFiltersSchema>;

export const exportAnalyticsSchema = analyticsFiltersSchema.extend({
  cohortId: z.string().min(1),
});
export type ExportAnalyticsInput = z.infer<typeof exportAnalyticsSchema>;
