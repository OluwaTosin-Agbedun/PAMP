import "server-only";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import { canDecideStage, latestDecisionByStage, workflowStatusFor } from "../domain/executiveApproval";
import * as repo from "../repositories/executiveApprovalRepository";
import type { RecordApprovalStageDecisionInput } from "../validation/schemas";

/**
 * Records one stage's Executive decision against a ranking snapshot —
 * server-authorised exactly like `approveFinalRanking`'s existing
 * pattern, never a frontend-only toggle. Enforces the fixed Top 70 →
 * Top 60 → Final Selection → Verification & Confirmation order: a stage
 * can't be decided until the one before it is APPROVED, and an already-
 * APPROVED stage can't be re-decided (only a REJECTED one can be
 * retried, e.g. after the underlying list is adjusted).
 */
export async function recordApprovalStageDecision(actorId: string, input: RecordApprovalStageDecisionInput) {
  const actor = await requirePermission(actorId, PERMISSIONS.EXECUTIVE_APPROVE);

  const snapshot = await repo.getRankingSnapshotSummary(input.rankingSnapshotId);
  if (!snapshot) throw new NotFoundError("That ranking snapshot doesn't exist.");

  if (input.decision === "REJECTED" && !input.comment) {
    throw new ValidationError("A comment is required when rejecting a stage.");
  }

  const priorStages = await repo.listApprovalStagesForSnapshot(input.rankingSnapshotId);
  const latest = latestDecisionByStage(priorStages);

  const check = canDecideStage(input.stage, latest);
  if (!check.allowed) throw new ConflictError(check.reason);

  const previousStatus = priorStages.length > 0 ? priorStages[priorStages.length - 1].newStatus : null;
  const newStatus = workflowStatusFor(input.stage, input.decision);

  const created = await repo.createApprovalStage({
    rankingSnapshotId: input.rankingSnapshotId,
    stage: input.stage,
    decision: input.decision,
    approverId: actor.id,
    comment: input.comment ?? null,
    previousStatus,
    newStatus,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.RANKING_APPROVAL_STAGE_RECORDED,
    entityType: "RankingSnapshot",
    entityId: snapshot.id,
    cohortId: snapshot.cohortId,
    metadata: { stage: input.stage, decision: input.decision, comment: input.comment ?? null, previousStatus, newStatus },
  });

  return created;
}

/** The full staged history for a snapshot, plus its current derived status — the read side Phase 4's dashboard will consume. */
export async function getApprovalStageHistory(actorId: string, rankingSnapshotId: string) {
  await requirePermission(actorId, PERMISSIONS.EXECUTIVE_VIEW);

  const snapshot = await repo.getRankingSnapshotSummary(rankingSnapshotId);
  if (!snapshot) throw new NotFoundError("That ranking snapshot doesn't exist.");

  const stages = await repo.listApprovalStagesForSnapshot(rankingSnapshotId);
  const currentStatus = stages.length > 0 ? stages[stages.length - 1].newStatus : "NOT_STARTED";

  return { snapshot, stages, currentStatus };
}
