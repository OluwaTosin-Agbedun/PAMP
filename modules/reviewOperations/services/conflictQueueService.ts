import "server-only";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import * as repo from "../repositories/conflictQueueRepository";

export type ConflictQueueEntry = {
  id: string;
  kind: "PRE_ASSIGNMENT_EXCLUSION" | "POST_ASSIGNMENT_RECUSAL";
  reviewerId: string;
  reviewerName: string;
  applicationId: string;
  applicationNumber: string;
  applicantName: string;
  pathway: string | null;
  reason: string | null;
  source: string | null;
  declaredByName: string | null;
  recordedAt: string;
};

/**
 * Conflict and recusal queue (Phase 3D §"Conflict and recusal queue") —
 * two distinct mechanisms shown together (`docs/RBAC.md`/Phase 3B's
 * documented distinction): pre-assignment exclusions
 * (`ReviewConflictOfInterest`, prevents ever being assigned) and
 * post-assignment recusals (`Review.status = RECUSED`, an already-
 * assigned reviewer steps back). Gated by `conflicts.manage` (Phase 3B,
 * reused).
 */
export async function getConflictQueue(actorId: string, cohortId: string): Promise<ConflictQueueEntry[]> {
  await requirePermission(actorId, PERMISSIONS.CONFLICTS_MANAGE);

  const [conflicts, recusals] = await Promise.all([
    repo.listConflictsForCohort(cohortId),
    repo.listRecusedReviewsForCohort(cohortId),
  ]);

  const conflictEntries: ConflictQueueEntry[] = conflicts.map((c) => ({
    id: c.reviewerId + c.applicationId,
    kind: "PRE_ASSIGNMENT_EXCLUSION",
    reviewerId: c.reviewerId,
    reviewerName: c.reviewer.name,
    applicationId: c.application.id,
    applicationNumber: c.application.applicant.externalRef ?? c.application.id,
    applicantName: `${c.application.applicant.firstName} ${c.application.applicant.lastName}`,
    pathway: c.application.pathway,
    reason: c.reason,
    source: c.source,
    declaredByName: c.declaredBy.name,
    recordedAt: c.createdAt.toISOString(),
  }));

  const recusalEntries: ConflictQueueEntry[] = recusals.map((r) => ({
    id: r.id,
    kind: "POST_ASSIGNMENT_RECUSAL",
    reviewerId: r.reviewerId,
    reviewerName: r.reviewer.name,
    applicationId: r.application.id,
    applicationNumber: r.application.applicant.externalRef ?? r.application.id,
    applicantName: `${r.application.applicant.firstName} ${r.application.applicant.lastName}`,
    pathway: r.application.pathway,
    reason: null,
    source: null,
    declaredByName: null,
    recordedAt: r.updatedAt.toISOString(),
  }));

  return [...conflictEntries, ...recusalEntries].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
}
