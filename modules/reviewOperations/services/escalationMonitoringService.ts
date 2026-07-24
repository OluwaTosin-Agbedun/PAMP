import "server-only";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import * as repo from "../repositories/escalationMonitoringRepository";

export type EscalationMonitoringRow = {
  escalationId: string;
  applicationId: string;
  applicationNumber: string;
  applicantName: string;
  pathway: string | null;
  configuredThresholdPercent: string;
  firstReviewerName: string;
  firstScore: string | null;
  secondReviewerName: string;
  secondScore: string | null;
  divergencePercent: string;
  thirdReviewerName: string | null;
  thirdReviewAssignmentStatus: string | null;
  thirdReviewStatus: string | null;
  thirdReviewScore: string | null;
  resolvedFinalScore: string | null;
  resolvedAt: string | null;
  triggeredAt: string;
};

/**
 * Third-review monitoring (Phase 3D). Gated by `review_escalations.view`
 * — deliberately narrower than `review_operations.view`, since this
 * exposes exactly which reviewer scored what and by how much they
 * diverged, which is more sensitive than ordinary assignment status. Not
 * exposed to reviewers under any permission (§"Do not disclose this
 * information to reviewers" — no role granted `REVIEWS_PERFORM`/
 * `REVIEWS_VIEW` is ever also granted `review_escalations.view`; see
 * docs/RBAC.md).
 */
export async function getEscalationMonitoring(actorId: string, cohortId: string): Promise<EscalationMonitoringRow[]> {
  await requirePermission(actorId, PERMISSIONS.REVIEW_ESCALATIONS_VIEW);

  const escalations = await repo.listEscalationsForCohort(cohortId);

  return escalations.map((e) => ({
    escalationId: e.id,
    applicationId: e.application.id,
    applicationNumber: e.application.applicant.externalRef ?? e.application.id,
    applicantName: `${e.application.applicant.firstName} ${e.application.applicant.lastName}`,
    pathway: e.application.pathway,
    // The threshold *applied* to this specific escalation, stored at the
    // moment it was created (Phase 3B) — the historical fact, which may
    // differ from today's configured `SystemSetting` value if it's
    // changed since.
    configuredThresholdPercent: e.thresholdApplied.toString(),
    firstReviewerName: e.firstReview.reviewer.name,
    firstScore: e.firstReview.totalScore ? e.firstReview.totalScore.toString() : null,
    secondReviewerName: e.secondReview.reviewer.name,
    secondScore: e.secondReview.totalScore ? e.secondReview.totalScore.toString() : null,
    divergencePercent: e.scoreDifference.toString(),
    thirdReviewerName: e.thirdReviewAssignment?.reviewer.name ?? null,
    thirdReviewAssignmentStatus: e.thirdReviewAssignment?.status ?? null,
    thirdReviewStatus: e.thirdReviewAssignment?.review?.status ?? null,
    thirdReviewScore: e.thirdReviewAssignment?.review?.totalScore
      ? e.thirdReviewAssignment.review.totalScore.toString()
      : null,
    resolvedFinalScore: e.resolvedFinalScore ? e.resolvedFinalScore.toString() : null,
    resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
    triggeredAt: e.createdAt.toISOString(),
  }));
}
