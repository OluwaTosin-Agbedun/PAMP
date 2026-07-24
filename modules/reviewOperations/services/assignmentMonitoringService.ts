import "server-only";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import * as repo from "../repositories/assignmentMonitoringRepository";
import type {
  AssignmentMonitoringFilters,
  AssignmentMonitoringResult,
  AssignmentMonitoringRow,
  AssignmentRowReviewer,
} from "../types";

function deriveOverallStatus(reviewers: AssignmentRowReviewer[]): AssignmentMonitoringRow["overallStatus"] {
  if (reviewers.length === 0) return "AWAITING_ASSIGNMENT";
  if (reviewers.some((r) => r.assignmentStatus === "ESCALATED")) return "ESCALATED";
  if (reviewers.every((r) => r.assignmentStatus === "COMPLETED" || r.reviewStatus === "SUBMITTED")) return "SUBMITTED";
  if (reviewers.every((r) => !r.reviewStatus || r.reviewStatus === "NOT_STARTED")) return "NOT_STARTED";
  return "IN_PROGRESS";
}

/**
 * The Assignment Monitoring table's read model (Phase 3D). Loads a
 * cohort-scoped dataset (`repo.loadMonitoringDataset`), groups it by
 * application, derives `overallStatus`/`isOverdue`/`hasConflict`/
 * `hasThirdReview` from stored data only (never a recalculated score —
 * see docs/adr/ADR-review-operations-read-model.md), applies every
 * remaining filter, then sorts and paginates — server-side, before
 * anything is sent to the page.
 */
export async function getAssignmentMonitoring(
  actorId: string,
  programmeId: string,
  cohortId: string,
  filters: AssignmentMonitoringFilters,
): Promise<AssignmentMonitoringResult> {
  await requirePermission(actorId, PERMISSIONS.REVIEW_OPERATIONS_VIEW);

  const [{ applications, assignments, conflicts, escalations }, stage, pathwayOptions, reviewerOptions] =
    await Promise.all([
      repo.loadMonitoringDataset(cohortId, filters.pathway),
      repo.getActiveReviewStageForCohort(programmeId, cohortId),
      repo.listDistinctPathways(cohortId),
      repo.listActiveApplicationReviewers(),
    ]);

  const dueDate = stage?.closesAt ?? null;
  const now = new Date();

  const assignmentsByApplication = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsByApplication.get(a.applicationId) ?? [];
    list.push(a);
    assignmentsByApplication.set(a.applicationId, list);
  }
  const conflictedApplicationIds = new Set(conflicts.map((c) => c.applicationId));
  const escalationByApplication = new Map(escalations.map((e) => [e.applicationId, e]));

  let rows: AssignmentMonitoringRow[] = applications.map((application) => {
    const applicationAssignments = assignmentsByApplication.get(application.id) ?? [];
    const reviewers: AssignmentRowReviewer[] = applicationAssignments.map((a) => ({
      assignmentId: a.id,
      slot: a.slot,
      reviewerId: a.reviewerId,
      reviewerName: a.reviewer.name,
      assignmentStatus: a.status,
      reviewStatus: a.review?.status ?? null,
      assignedAt: a.assignedAt.toISOString(),
      submittedAt: a.review?.submittedAt ? a.review.submittedAt.toISOString() : null,
      hasConflict: conflictedApplicationIds.has(application.id) && conflicts.some((c) => c.applicationId === application.id && c.reviewerId === a.reviewerId),
    }));

    const overallStatus = deriveOverallStatus(reviewers);
    const isOverdue = Boolean(dueDate && dueDate < now && overallStatus !== "SUBMITTED" && reviewers.length > 0);
    const earliestAssignedAt = applicationAssignments.length
      ? applicationAssignments.reduce((min, a) => (a.assignedAt < min ? a.assignedAt : min), applicationAssignments[0].assignedAt)
      : null;

    return {
      applicationId: application.id,
      applicationNumber: application.applicant.externalRef ?? application.id,
      applicantName: `${application.applicant.firstName} ${application.applicant.lastName}`,
      pathway: application.pathway,
      reviewers,
      overallStatus,
      hasConflict: conflictedApplicationIds.has(application.id),
      hasThirdReview: escalationByApplication.has(application.id),
      isOverdue,
      dueDate: dueDate ? dueDate.toISOString() : null,
      assignedAt: earliestAssignedAt ? earliestAssignedAt.toISOString() : null,
    };
  });

  if (filters.reviewerId) {
    const reviewerId = filters.reviewerId;
    rows = rows.filter((r) => r.reviewers.some((rev) => rev.reviewerId === reviewerId));
  }
  if (filters.status) {
    rows = rows.filter((r) => r.overallStatus === filters.status);
  }
  if (filters.overdueOnly) {
    rows = rows.filter((r) => r.isOverdue);
  }
  if (filters.conflictOnly) {
    rows = rows.filter((r) => r.hasConflict);
  }
  if (filters.thirdReviewOnly) {
    rows = rows.filter((r) => r.hasThirdReview);
  }
  if (filters.assignedFrom) {
    const from = new Date(filters.assignedFrom);
    rows = rows.filter((r) => r.assignedAt && new Date(r.assignedAt) >= from);
  }
  if (filters.assignedTo) {
    const to = new Date(filters.assignedTo);
    rows = rows.filter((r) => r.assignedAt && new Date(r.assignedAt) <= to);
  }

  const total = rows.length;
  const start = (filters.page - 1) * filters.pageSize;
  const paged = rows.slice(start, start + filters.pageSize);

  return {
    total,
    rows: paged,
    pathwayOptions,
    reviewerOptions: reviewerOptions.map((r) => ({ id: r.id, name: r.name })),
  };
}

/** Unpaginated version for export — same filters, same permission, every matching row. */
export async function getAssignmentMonitoringForExport(
  actorId: string,
  programmeId: string,
  cohortId: string,
  filters: Omit<AssignmentMonitoringFilters, "page" | "pageSize">,
): Promise<AssignmentMonitoringRow[]> {
  const result = await getAssignmentMonitoring(actorId, programmeId, cohortId, {
    ...filters,
    page: 1,
    pageSize: Number.MAX_SAFE_INTEGER,
  });
  return result.rows;
}
