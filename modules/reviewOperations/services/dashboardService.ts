import "server-only";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";
import { getNumericSettingValue } from "@/lib/settings/service";

import * as dashboardRepo from "../repositories/dashboardRepository";

export type ReviewOperationsDashboard = {
  totalEligibleApplications: number;
  applicationsAssigned: number;
  applicationsAwaitingAssignment: number;
  reviewsNotStarted: number;
  reviewsInProgress: number;
  reviewsSubmitted: number;
  reviewsOverdue: number;
  recusals: number;
  reassignments: number;
  thirdReviewsTriggered: number;
  thirdReviewsOutstanding: number;
  stageCompletionPercent: number;
  reviewerUtilisationPercent: number;
};

/**
 * The "DashboardService" the Phase 3D brief asks for by name — the one
 * place every dashboard aggregate is computed, so no page component ever
 * writes its own aggregate query (§ "Do not place aggregate query logic
 * directly in page components"). Every number here is a stored-data
 * count or a ratio of stored-data counts — nothing is recomputed from a
 * scoring formula; see docs/adr/ADR-review-operations-read-model.md.
 */
export async function getReviewOperationsDashboard(
  actorId: string,
  programmeId: string,
  cohortId: string,
): Promise<ReviewOperationsDashboard> {
  await requirePermission(actorId, PERMISSIONS.REVIEW_OPERATIONS_VIEW);

  const [
    totalEligibleApplications,
    applicationsAssigned,
    reviewsNotStartedWithRow,
    assignmentsWithoutReview,
    reviewsInProgress,
    reviewsSubmitted,
    reviewsOverdue,
    recusals,
    reassignments,
    thirdReviewsTriggered,
    thirdReviewsOutstanding,
    activeAssignmentsTotal,
    completedAssignments,
    reviewerLoads,
  ] = await Promise.all([
    dashboardRepo.countEligibleApplications(cohortId),
    dashboardRepo.countApplicationsAssigned(cohortId),
    dashboardRepo.countReviewsByStatus(cohortId, ["NOT_STARTED"]),
    dashboardRepo.countAssignmentsWithoutReview(cohortId),
    dashboardRepo.countReviewsByStatus(cohortId, ["IN_PROGRESS", "REOPENED"]),
    dashboardRepo.countReviewsByStatus(cohortId, ["SUBMITTED"]),
    dashboardRepo.countOverdueAssignments(cohortId, programmeId),
    dashboardRepo.countRecusals(cohortId),
    dashboardRepo.countReassignments(cohortId),
    dashboardRepo.countEscalations(cohortId),
    dashboardRepo.countOutstandingEscalations(cohortId),
    dashboardRepo.countActiveAssignmentsTotal(cohortId),
    dashboardRepo.countCompletedAssignments(cohortId),
    dashboardRepo.listReviewerLoadForUtilisation(programmeId),
  ]);

  const reviewsNotStarted = reviewsNotStartedWithRow + assignmentsWithoutReview;
  const applicationsAwaitingAssignment = Math.max(0, totalEligibleApplications - applicationsAssigned);

  const totalAssignmentsForCompletion = activeAssignmentsTotal + completedAssignments;
  const stageCompletionPercent = totalAssignmentsForCompletion
    ? Math.round((completedAssignments / totalAssignmentsForCompletion) * 100)
    : 0;

  const utilisationRatios = reviewerLoads
    .filter((r) => r.maxConcurrentAssignments > 0)
    .map((r) => r.activeAssignmentCount / r.maxConcurrentAssignments);
  const reviewerUtilisationPercent = utilisationRatios.length
    ? Math.round((utilisationRatios.reduce((sum, r) => sum + r, 0) / utilisationRatios.length) * 100)
    : 0;

  return {
    totalEligibleApplications,
    applicationsAssigned,
    applicationsAwaitingAssignment,
    reviewsNotStarted,
    reviewsInProgress,
    reviewsSubmitted,
    reviewsOverdue,
    recusals,
    reassignments,
    thirdReviewsTriggered,
    thirdReviewsOutstanding,
    stageCompletionPercent,
    reviewerUtilisationPercent,
  };
}

export type RiskDashboard = {
  applicationsApproachingDeadline: number;
  overloadedReviewers: number;
  thirdReviewRatePercent: number;
  conflictDeclarations: number;
  pendingEscalations: number;
  reviewBacklog: number;
  averageCompletionHours: number | null;
  applicationsStalled: number;
  applicationsAwaitingReassignment: number;
  applicationsRequiringAttention: number;
};

/**
 * Release 1.5 §"Operational Dashboard" — "Extend the Secretariat
 * Dashboard with a Risk Dashboard... No new business logic. Only
 * aggregate existing data." Every figure here is either a direct reuse
 * of a `ReviewOperationsDashboard` count, a straightforward ratio of two
 * of them, or a new repository aggregate over already-stored timestamps
 * — no new domain rule, no recalculated score. Lives in this same
 * service file (not a separate module) because it *is* an extension of
 * the one dashboard this codebase already has, not a second dashboard.
 */
export async function getRiskDashboard(actorId: string, programmeId: string, cohortId: string): Promise<RiskDashboard> {
  await requirePermission(actorId, PERMISSIONS.REVIEW_OPERATIONS_VIEW);

  // Reuses the one window setting Release 1.5 already added
  // (`review.reminder_frequency_days`) for both "approaching deadline"
  // and "stalled" — the same underlying question ("how many days is too
  // long to sit untouched?"), asked from two directions, rather than a
  // second, redundant setting.
  const [base, windowDays] = await Promise.all([
    getReviewOperationsDashboard(actorId, programmeId, cohortId),
    getNumericSettingValue("review.reminder_frequency_days"),
  ]);

  const [
    applicationsApproachingDeadline,
    reviewerLoads,
    conflictDeclarations,
    averageCompletionHours,
    applicationsStalled,
    applicationsAwaitingReassignment,
  ] = await Promise.all([
    dashboardRepo.countApplicationsApproachingDeadline(cohortId, programmeId, windowDays),
    dashboardRepo.listReviewerLoadForUtilisation(programmeId),
    dashboardRepo.countConflictDeclarations(cohortId),
    dashboardRepo.getAverageCompletionHours(cohortId),
    dashboardRepo.countStalledApplications(cohortId, windowDays),
    dashboardRepo.countApplicationsAwaitingReassignment(cohortId),
  ]);

  const overloadedReviewers = reviewerLoads.filter(
    (r) => r.maxConcurrentAssignments > 0 && r.activeAssignmentCount >= r.maxConcurrentAssignments,
  ).length;

  const thirdReviewRatePercent = base.applicationsAssigned
    ? Math.round((base.thirdReviewsTriggered / base.applicationsAssigned) * 100)
    : 0;

  const reviewBacklog = base.reviewsNotStarted + base.reviewsInProgress;

  // "Requiring attention" — the union of every risk signal above,
  // deliberately not a sum (an application overdue AND stalled should
  // count once, not twice). Approximated here as the largest single
  // contributing count rather than a true set union across application
  // IDs — computing the exact union would mean re-fetching every
  // signal's application ID list a second time purely to deduplicate
  // for one summary number; the per-signal counts above already give
  // the Secretariat the precise breakdown, and this total is explicitly
  // a rough "how much is going on" indicator, not a drill-down target.
  const applicationsRequiringAttention = Math.max(
    base.reviewsOverdue,
    applicationsStalled,
    applicationsAwaitingReassignment,
    base.thirdReviewsOutstanding,
  );

  return {
    applicationsApproachingDeadline,
    overloadedReviewers,
    thirdReviewRatePercent,
    conflictDeclarations,
    pendingEscalations: base.thirdReviewsOutstanding,
    reviewBacklog,
    averageCompletionHours,
    applicationsStalled,
    applicationsAwaitingReassignment,
    applicationsRequiringAttention,
  };
}
