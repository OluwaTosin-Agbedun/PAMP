import "server-only";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import { calculateCompositeScore, decisionBandFor, determineRankingEligibility, toDecimal } from "../domain/ranking";
import * as repo from "../repositories/rankingRepository";
import type { ExcludedApplicationSummary } from "./rankingService";

/**
 * §5.5 — everything the Final Ranking Workspace's list needs in one
 * call: the latest snapshot's entries (if one has ever been generated),
 * every currently-excluded application with its reason, and — critically
 * — whether the live composite score for a ranked entry has since
 * drifted from what the snapshot recorded (an upstream correction after
 * generation). §5.3: "prevent stale rankings from being presented as
 * current" — this is what makes that drift visible instead of silent.
 */
export async function getRankingWorkspace(actorId: string, cohortId: string) {
  await requirePermission(actorId, PERMISSIONS.RANKING_VIEW);

  const [snapshot, scores, integrityHolds] = await Promise.all([
    repo.getLatestSnapshotForCohort(cohortId).then((s) => (s ? repo.getSnapshotDetail(s.id) : null)),
    repo.listApplicationScoresForCohort(cohortId),
    repo.listApplicationIdsWithIntegrityHold(cohortId),
  ]);

  const scoreByApplicationId = new Map(scores.map((s) => [s.applicationId, s]));

  const excluded: ExcludedApplicationSummary[] = [];
  for (const score of scores) {
    const eligibility = determineRankingEligibility({
      eligibilityStatus: score.application.eligibilityStatus,
      deletedAt: score.application.deletedAt,
      isWithdrawn: score.application.isWithdrawn,
      reviewAverage: score.reviewAverage,
      interviewAverage: score.interviewAverage,
      hasIntegrityHold: integrityHolds.has(score.applicationId),
    });
    if (!eligibility.eligible) {
      excluded.push({
        applicationId: score.applicationId,
        applicantName: `${score.application.applicant.firstName} ${score.application.applicant.lastName}`,
        reason: eligibility.reason,
      });
    }
  }

  const entries =
    snapshot?.entries.map((entry) => {
      const live = scoreByApplicationId.get(entry.applicationId);
      const liveCompositeScore =
        live?.reviewAverage != null && live?.interviewAverage != null
          ? calculateCompositeScore(live.reviewAverage, live.interviewAverage)
          : null;
      const scoreDrifted = liveCompositeScore !== null && !liveCompositeScore.equals(entry.score);

      return {
        applicationId: entry.applicationId,
        applicantName: `${entry.application.applicant.firstName} ${entry.application.applicant.lastName}`,
        pathway: entry.application.pathway,
        rank: entry.rank,
        reviewAverage: live?.reviewAverage ? toDecimal(live.reviewAverage) : null,
        interviewAverage: live?.interviewAverage ? toDecimal(live.interviewAverage) : null,
        snapshotScore: toDecimal(entry.score),
        liveCompositeScore,
        scoreDrifted,
        decisionBand: decisionBandFor(entry.score),
        withinFinalCohort: snapshot ? entry.rank <= snapshot.targetSize : false,
      };
    }) ?? [];

  const tieResolutions = snapshot?.tieResolutions ?? [];

  return { snapshot, entries, excluded, tieResolutions };
}

/** §5.6 — one candidate's full ranking record, for the detail view. */
export async function getCandidateRankingDetail(actorId: string, applicationId: string) {
  await requirePermission(actorId, PERMISSIONS.RANKING_VIEW);

  const application = await repo.getApplicationForRankingDetail(applicationId);
  if (!application) throw new NotFoundError("That application doesn't exist.");

  const integrityHolds = await repo.listApplicationIdsWithIntegrityHold(application.cohortId);
  const score = application.applicationScore;

  const eligibility = determineRankingEligibility({
    eligibilityStatus: application.eligibilityStatus,
    deletedAt: application.deletedAt,
    isWithdrawn: application.isWithdrawn,
    reviewAverage: score?.reviewAverage ?? null,
    interviewAverage: score?.interviewAverage ?? null,
    hasIntegrityHold: integrityHolds.has(application.id),
  });

  const compositeScore =
    score?.reviewAverage != null && score?.interviewAverage != null
      ? calculateCompositeScore(score.reviewAverage, score.interviewAverage)
      : null;

  const latestSnapshot = await repo.getLatestSnapshotForCohort(application.cohortId);
  const snapshotDetail = latestSnapshot ? await repo.getSnapshotDetail(latestSnapshot.id) : null;
  const snapshotEntry = snapshotDetail?.entries.find((e) => e.applicationId === applicationId) ?? null;
  const tieResolution = snapshotDetail?.tieResolutions.find((tie) =>
    tie.applications.some((a) => a.applicationId === applicationId),
  );

  return {
    application,
    eligibility,
    compositeScore,
    decisionBand: compositeScore !== null ? decisionBandFor(compositeScore) : null,
    snapshot: snapshotDetail
      ? {
          id: snapshotDetail.id,
          isLocked: snapshotDetail.isLocked,
          generatedAt: snapshotDetail.generatedAt,
          targetSize: snapshotDetail.targetSize,
        }
      : null,
    snapshotEntry: snapshotEntry ? { rank: snapshotEntry.rank, score: toDecimal(snapshotEntry.score) } : null,
    tieResolution: tieResolution ?? null,
  };
}

const CSV_COLUMNS = [
  "Rank",
  "Application ID",
  "Applicant Name",
  "Pathway",
  "Application Review Score (/60)",
  "Interview Score (/40)",
  "Final Score (/100)",
  "Decision Band",
  "Within Final Cohort",
  "Tie (Level 3)",
] as const;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * CSV export of the current Final Ranking (§5.5's "Exporting, where
 * approved" + the addendum's Module 9 audit list). Mirrors
 * `reviewOperations/services/exportService.ts`'s data-minimization
 * discipline: ranking-relevant fields only, no reviewer/panellist
 * identities or comments — those stay behind `REVIEW_SCORES_VIEW`/
 * `INTERVIEW_SCORES_VIEW_ALL` on the detail view, never in a download.
 */
export async function exportRankingCsv(actorId: string, cohortId: string): Promise<string> {
  const actor = await requirePermission(actorId, PERMISSIONS.RANKING_EXPORT);

  const workspace = await getRankingWorkspace(actorId, cohortId);
  const tiedApplicationIds = new Set(
    workspace.tieResolutions.flatMap((tie) => tie.applications.map((a) => a.applicationId)),
  );

  const lines = [CSV_COLUMNS.join(",")];
  for (const entry of workspace.entries) {
    const live = entry.liveCompositeScore ?? entry.snapshotScore;
    lines.push(
      [
        String(entry.rank),
        entry.applicationId,
        entry.applicantName,
        entry.pathway ?? "",
        entry.reviewAverage?.toString() ?? "",
        entry.interviewAverage?.toString() ?? "",
        live.toString(),
        entry.decisionBand,
        entry.withinFinalCohort ? "Yes" : "No",
        tiedApplicationIds.has(entry.applicationId) ? "Yes" : "No",
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.RANKING_EXPORTED,
    entityType: "Cohort",
    entityId: cohortId,
    cohortId,
    metadata: { rowCount: workspace.entries.length, snapshotId: workspace.snapshot?.id ?? null },
  });

  const BOM = "﻿";
  return BOM + lines.join("\r\n");
}
