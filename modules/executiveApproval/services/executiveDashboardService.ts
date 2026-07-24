import "server-only";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";
import { getRankingWorkspace } from "@/modules/ranking/services/rankingWorkspaceService";

import { latestDecisionByStage, nextActionableStage, withinStageBracket } from "../domain/executiveApproval";
import * as dashboardRepo from "../repositories/executiveDashboardRepository";
import * as approvalRepo from "../repositories/executiveApprovalRepository";

/**
 * Everything the Executive Dashboard's single page needs in one call —
 * the same "one workspace call, not one query per widget" shape
 * `getRankingWorkspace` and `getReviewOperationsDashboard` already
 * established. Ranking entries come straight from `getRankingWorkspace`
 * (itself gated on `RANKING_VIEW`, which every role that reaches this
 * dashboard already holds) rather than a fresh query, specifically so
 * this dashboard inherits that function's confidentiality shape —
 * applicant name/pathway/rank/decision band only, never a reviewer
 * identity or an individual reviewer's comment.
 */
export async function getExecutiveDashboard(actorId: string, cohortId: string) {
  await requirePermission(actorId, PERMISSIONS.EXECUTIVE_VIEW);

  const [totalApplications, eligibilityCounts, interviewCounts, workspace] = await Promise.all([
    dashboardRepo.countTotalApplications(cohortId),
    dashboardRepo.countApplicationsByEligibilityStatus(cohortId),
    dashboardRepo.countInterviewsByStatus(cohortId),
    getRankingWorkspace(actorId, cohortId),
  ]);

  const snapshot = workspace.snapshot;
  if (!snapshot) {
    return {
      totalApplications,
      eligibilityCounts,
      interviewCounts,
      snapshot: null,
      entries: [],
      approval: null,
    };
  }

  const stages = await approvalRepo.listApprovalStagesForSnapshot(snapshot.id);
  const latest = latestDecisionByStage(stages);

  const entries = workspace.entries.map((entry) => ({
    applicationId: entry.applicationId,
    applicantName: entry.applicantName,
    pathway: entry.pathway,
    rank: entry.rank,
    decisionBand: entry.decisionBand,
    withinTop70: withinStageBracket(entry.rank, "TOP_70", snapshot.targetSize),
    withinTop60: withinStageBracket(entry.rank, "TOP_60", snapshot.targetSize),
    withinFinalSelection: withinStageBracket(entry.rank, "FINAL_SELECTION", snapshot.targetSize),
  }));

  return {
    totalApplications,
    eligibilityCounts,
    interviewCounts,
    snapshot: { id: snapshot.id, targetSize: snapshot.targetSize, isLocked: snapshot.isLocked, generatedAt: snapshot.generatedAt },
    entries,
    approval: {
      stages,
      currentStatus: stages.length > 0 ? stages[stages.length - 1].newStatus : "NOT_STARTED",
      nextActionableStage: nextActionableStage(latest),
    },
  };
}
