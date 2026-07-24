import "server-only";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";
import { getNumericSettingValue } from "@/lib/settings/service";

import {
  calculateCompositeScore,
  decisionBandFor,
  determineRankingEligibility,
  rankApplications,
  toDecimal,
  type RankableApplication,
  type RankingEligibilityResult,
  type RankingIneligibilityReason,
} from "../domain/ranking";
import * as repo from "../repositories/rankingRepository";
import type { ApproveFinalRankingInput, GenerateFinalRankingInput, ReopenFinalRankingInput, ResolveTieInput } from "../validation/schemas";

export type ExcludedApplicationSummary = {
  applicationId: string;
  applicantName: string;
  reason: RankingIneligibilityReason;
};

/**
 * §5.1/§5.3 — the actual "Generate Ranking" action (Addendum Module 4):
 * reads every cohort application's live `ApplicationScore`, splits it
 * into eligible/excluded via the domain layer's `determineRankingEligibility`,
 * ranks the eligible set with the exact Addendum Module 5 tie rule, and
 * records the result as an immutable `RankingSnapshot` — the same
 * generalized mechanism `generateInterviewShortlist` already uses for
 * "Interview Shortlist," not a bespoke table. Unlike that shortlist
 * (which stores only a truncated top-N candidate pool), this stores
 * *every* eligible application — Final Ranking's job is the full ranked
 * order, not a cutoff; `targetSize` is recorded as the confirmed
 * final-cohort-size policy value for reference, not a truncation.
 *
 * Refuses to run again while the cohort's latest snapshot is locked
 * (§8: "Recalculation of an immutable approved snapshot without an
 * authorised reopen action") — `reopenFinalRanking` is the only way past
 * that gate.
 */
export async function generateFinalRanking(actorId: string, input: GenerateFinalRankingInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.RANKING_GENERATE);

  const latest = await repo.getLatestSnapshotForCohort(input.cohortId);
  if (latest?.isLocked) {
    throw new ConflictError("The current Final Ranking is approved and locked — reopen it before regenerating.");
  }

  const [scores, integrityHolds, finalCohortSize] = await Promise.all([
    repo.listApplicationScoresForCohort(input.cohortId),
    repo.listApplicationIdsWithIntegrityHold(input.cohortId),
    getNumericSettingValue("ranking.finalCohortSize"),
  ]);

  const eligible: RankableApplication[] = [];
  const excluded: ExcludedApplicationSummary[] = [];

  for (const score of scores) {
    const eligibility: RankingEligibilityResult = determineRankingEligibility({
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
      continue;
    }

    eligible.push({
      applicationId: score.applicationId,
      // Computed inline from the two authoritative averages rather than
      // trusting the cached `compositeScore` column — the cache is
      // correct by construction going forward (recomputeCompositeScore
      // is called from every average recompute), but this avoids ever
      // depending on that cache being warm.
      compositeScore: calculateCompositeScore(score.reviewAverage!, score.interviewAverage!),
      interviewAverage: score.interviewAverage!,
      reviewAverage: score.reviewAverage!,
    });
  }

  if (eligible.length === 0) {
    throw new ValidationError("No applications are currently eligible for Final Ranking — nothing to generate.");
  }

  const { entries, tieGroups } = rankApplications(eligible);

  const snapshot = await repo.createFinalRankingSnapshot(
    input.cohortId,
    finalCohortSize,
    actor.id,
    entries.map((entry) => ({ applicationId: entry.applicationId, rank: entry.rank, score: entry.compositeScore })),
  );

  if (tieGroups.length > 0) {
    await repo.createTieResolutions(
      snapshot.id,
      input.cohortId,
      tieGroups.map((group) => ({ score: group.compositeScore, applicationIds: group.applicationIds })),
    );
  }

  await repo.updateApplicationScoreRanks([
    ...entries.map((entry) => ({ applicationId: entry.applicationId, rank: entry.rank })),
    ...excluded.map((entry) => ({ applicationId: entry.applicationId, rank: null })),
  ]);

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.RANKING_GENERATED,
    entityType: "RankingSnapshot",
    entityId: snapshot.id,
    cohortId: input.cohortId,
    metadata: {
      eligibleCount: eligible.length,
      excludedCount: excluded.length,
      tieGroupCount: tieGroups.length,
      finalCohortSize,
      supersededSnapshotId: latest?.id ?? null,
    },
  });

  for (const group of tieGroups) {
    await writeAuditLog({
      actorId: actor.id,
      action: AUDIT_ACTIONS.RANKING_TIE_DETECTED,
      entityType: "RankingSnapshot",
      entityId: snapshot.id,
      cohortId: input.cohortId,
      metadata: { compositeScore: group.compositeScore.toString(), applicationIds: group.applicationIds },
    });
  }

  return { snapshot, excluded, tieGroupCount: tieGroups.length };
}

/**
 * §5.8 — locks the snapshot so its entries become the permanent
 * historical record regardless of later `ApplicationScore` recalculation
 * (the exact guarantee `docs/database.md` designed `RankingSnapshot.isLocked`
 * for). Refuses while any Level 3 tie from this snapshot is still
 * unresolved (§8: "Approval while unresolved ties remain, unless
 * explicitly allowed" — no approved override mechanism exists in any
 * source document, so this is a hard gate).
 */
export async function approveFinalRanking(actorId: string, input: ApproveFinalRankingInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.RANKING_APPROVE);

  const snapshot = await repo.getSnapshotDetail(input.rankingSnapshotId);
  if (!snapshot) throw new NotFoundError("That ranking snapshot doesn't exist.");
  if (snapshot.isLocked) throw new ConflictError("This ranking is already approved.");

  const pendingTies = snapshot.tieResolutions.filter((tie) => tie.status === "PENDING");
  if (pendingTies.length > 0) {
    throw new ValidationError(
      `${pendingTies.length} unresolved Level 3 tie(s) remain — the Selection Committee must resolve every tie before this ranking can be approved.`,
    );
  }

  await repo.lockSnapshot(snapshot.id, actor.id);

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.RANKING_APPROVED,
    entityType: "RankingSnapshot",
    entityId: snapshot.id,
    cohortId: snapshot.cohortId,
    metadata: { entryCount: snapshot.entries.length },
  });

  return repo.getSnapshotDetail(snapshot.id);
}

/** §5.8 — System-Administrator-only (mirrors REVIEW_SCORES_REOPEN's placement), mandatory reason. */
export async function reopenFinalRanking(actorId: string, input: ReopenFinalRankingInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.RANKING_REOPEN);

  const snapshot = await repo.getSnapshotDetail(input.rankingSnapshotId);
  if (!snapshot) throw new NotFoundError("That ranking snapshot doesn't exist.");
  if (!snapshot.isLocked) throw new ValidationError("This ranking isn't currently locked.");

  await repo.unlockSnapshot(snapshot.id, actor.id, input.reason);

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.RANKING_REOPENED,
    entityType: "RankingSnapshot",
    entityId: snapshot.id,
    cohortId: snapshot.cohortId,
    metadata: { reason: input.reason },
  });

  return repo.getSnapshotDetail(snapshot.id);
}

/**
 * Addendum Module 5, Tie Level 3 — the Selection Committee's recorded
 * decision for one tied group. Never touches `ApplicationScore`/
 * `RankingSnapshotEntry` — a tie resolution records the committee's
 * chosen order *within the tied group*, it does not "silently alter the
 * calculated scores" (§5.4).
 */
export async function resolveTie(actorId: string, input: ResolveTieInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.RANKING_RESOLVE_TIES);

  const tie = await repo.getTieResolution(input.tieResolutionId);
  if (!tie) throw new NotFoundError("That tie resolution doesn't exist.");
  if (tie.status === "RESOLVED") throw new ConflictError("This tie has already been resolved.");

  const tiedApplicationIds = new Set(tie.applications.map((a) => a.applicationId));
  const submittedApplicationIds = new Set(input.resolvedRanks.map((r) => r.applicationId));
  const sameSet =
    tiedApplicationIds.size === submittedApplicationIds.size && [...tiedApplicationIds].every((id) => submittedApplicationIds.has(id));
  if (!sameSet) {
    throw new ValidationError("The resolved order must cover exactly the applications in this tied group — no more, no fewer.");
  }
  const resolvedRankValues = input.resolvedRanks.map((r) => r.resolvedRank);
  if (new Set(resolvedRankValues).size !== resolvedRankValues.length) {
    throw new ValidationError("Each application in a tied group must receive a distinct resolved rank.");
  }

  await repo.resolveTieResolution(tie.id, {
    resolvedById: actor.id,
    justification: input.justification,
    resolvedRanks: input.resolvedRanks,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.RANKING_TIE_RESOLVED,
    entityType: "RankingTieResolution",
    entityId: tie.id,
    cohortId: tie.cohortId,
    metadata: { justification: input.justification, resolvedRanks: input.resolvedRanks },
  });

  return repo.getTieResolution(tie.id);
}

export { decisionBandFor, toDecimal };
