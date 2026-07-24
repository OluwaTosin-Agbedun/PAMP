import type { getRankingWorkspace } from "@/modules/ranking/services/rankingWorkspaceService";
import type { FinalScoreDecisionBand, RankingIneligibilityReason } from "@/modules/ranking/domain/ranking";

/**
 * ADR-0010's Decimal-serialization discipline: every `Prisma.Decimal`
 * field is converted to a plain string here, in the Server Component,
 * before any of this crosses into a Client Component.
 */

export type RankingEntryViewModel = {
  applicationId: string;
  applicantName: string;
  pathway: string | null;
  rank: number;
  reviewAverage: string | null;
  interviewAverage: string | null;
  finalScore: string;
  scoreDrifted: boolean;
  decisionBand: FinalScoreDecisionBand;
  withinFinalCohort: boolean;
  isTied: boolean;
};

export type ExcludedApplicationViewModel = {
  applicationId: string;
  applicantName: string;
  reason: RankingIneligibilityReason;
};

export type TieResolutionViewModel = {
  id: string;
  status: "PENDING" | "RESOLVED";
  score: string;
  justification: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  applications: { applicationId: string; applicantName: string; resolvedRank: number | null }[];
};

export type RankingWorkspaceViewModel = {
  snapshot: { id: string; isLocked: boolean; generatedAt: string; generatedByName: string; targetSize: number } | null;
  entries: RankingEntryViewModel[];
  excluded: ExcludedApplicationViewModel[];
  tieResolutions: TieResolutionViewModel[];
};

export const INELIGIBILITY_LABELS: Record<RankingIneligibilityReason, string> = {
  APPLICATION_NOT_ELIGIBLE: "Not marked eligible",
  APPLICATION_WITHDRAWN: "Withdrawn",
  MISSING_REVIEW_SCORE: "Application review not complete",
  MISSING_INTERVIEW_SCORE: "Interview not complete",
  INTEGRITY_HOLD: "Integrity hold",
};

export const DECISION_BAND_LABELS: Record<FinalScoreDecisionBand, string> = {
  STRONGLY_RECOMMENDED: "Strongly Recommended",
  RECOMMENDED: "Recommended",
  RESERVE_BORDERLINE: "Reserve / Borderline",
  NOT_RECOMMENDED: "Not Recommended",
};

export function toRankingWorkspaceViewModel(
  workspace: Awaited<ReturnType<typeof getRankingWorkspace>>,
): RankingWorkspaceViewModel {
  const tiedApplicationIds = new Set(
    workspace.tieResolutions.flatMap((tie) => tie.applications.map((a) => a.applicationId)),
  );

  return {
    snapshot: workspace.snapshot
      ? {
          id: workspace.snapshot.id,
          isLocked: workspace.snapshot.isLocked,
          generatedAt: workspace.snapshot.generatedAt.toISOString(),
          generatedByName: workspace.snapshot.generatedBy.name,
          targetSize: workspace.snapshot.targetSize,
        }
      : null,
    entries: workspace.entries.map((entry) => ({
      applicationId: entry.applicationId,
      applicantName: entry.applicantName,
      pathway: entry.pathway,
      rank: entry.rank,
      reviewAverage: entry.reviewAverage?.toString() ?? null,
      interviewAverage: entry.interviewAverage?.toString() ?? null,
      finalScore: (entry.liveCompositeScore ?? entry.snapshotScore).toString(),
      scoreDrifted: entry.scoreDrifted,
      decisionBand: entry.decisionBand,
      withinFinalCohort: entry.withinFinalCohort,
      isTied: tiedApplicationIds.has(entry.applicationId),
    })),
    excluded: workspace.excluded,
    tieResolutions: workspace.tieResolutions.map((tie) => ({
      id: tie.id,
      status: tie.status,
      score: tie.score.toString(),
      justification: tie.justification,
      resolvedByName: tie.resolvedBy?.name ?? null,
      resolvedAt: tie.resolvedAt?.toISOString() ?? null,
      applications: tie.applications.map((a) => ({
        applicationId: a.applicationId,
        applicantName: `${a.application.applicant.firstName} ${a.application.applicant.lastName}`,
        resolvedRank: a.resolvedRank,
      })),
    })),
  };
}
