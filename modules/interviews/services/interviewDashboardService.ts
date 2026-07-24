import "server-only";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import { getInterviewSummaryCounts, type InterviewSummaryCounts } from "../repositories/interviewRepository";

export type { InterviewSummaryCounts };

/** The Dashboard's "at a glance" Interviews row — mirrors modules/reviewOperations/services/dashboardService.ts's own gating pattern. */
export async function getInterviewDashboardSummary(actorId: string, cohortId: string): Promise<InterviewSummaryCounts> {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_OPERATIONS_VIEW);
  return getInterviewSummaryCounts(cohortId);
}
