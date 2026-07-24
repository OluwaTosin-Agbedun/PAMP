import type { RankingApprovalDecision, RankingApprovalStageType } from "@/lib/generated/prisma/enums";
import type { getExecutiveDashboard } from "@/modules/executiveApproval/services/executiveDashboardService";

export type ExecutiveRankingEntryViewModel = {
  applicationId: string;
  applicantName: string;
  pathway: string | null;
  rank: number;
  decisionBand: string;
  withinTop70: boolean;
  withinTop60: boolean;
  withinFinalSelection: boolean;
};

export type ApprovalStageRowViewModel = {
  id: string;
  stage: RankingApprovalStageType;
  decision: RankingApprovalDecision;
  approverName: string;
  comment: string | null;
  createdAt: string;
};

export type ExecutiveDashboardViewModel = {
  totalApplications: number;
  eligibilityCounts: { eligible: number; ineligible: number; pending: number; clarificationRequired: number; disqualified: number };
  interviewCounts: { scheduled: number; completed: number; cancelled: number; noShow: number };
  snapshot: { id: string; targetSize: number; isLocked: boolean; generatedAt: string } | null;
  entries: ExecutiveRankingEntryViewModel[];
  approval: {
    stages: ApprovalStageRowViewModel[];
    currentStatus: string;
    nextActionableStage: RankingApprovalStageType | null;
  } | null;
};

export const APPROVAL_STAGE_LABELS: Record<RankingApprovalStageType, string> = {
  TOP_70: "Top 70",
  TOP_60: "Top 60",
  FINAL_SELECTION: "Final Selection",
  VERIFICATION_CONFIRMATION: "Verification & Confirmation",
};

export function toExecutiveDashboardViewModel(
  dashboard: Awaited<ReturnType<typeof getExecutiveDashboard>>,
): ExecutiveDashboardViewModel {
  return {
    totalApplications: dashboard.totalApplications,
    eligibilityCounts: dashboard.eligibilityCounts,
    interviewCounts: dashboard.interviewCounts,
    snapshot: dashboard.snapshot ? { ...dashboard.snapshot, generatedAt: dashboard.snapshot.generatedAt.toISOString() } : null,
    entries: dashboard.entries,
    approval: dashboard.approval
      ? {
          currentStatus: dashboard.approval.currentStatus,
          nextActionableStage: dashboard.approval.nextActionableStage,
          stages: dashboard.approval.stages.map((row) => ({
            id: row.id,
            stage: row.stage,
            decision: row.decision,
            approverName: row.approver.name,
            comment: row.comment,
            createdAt: row.createdAt.toISOString(),
          })),
        }
      : null,
  };
}
