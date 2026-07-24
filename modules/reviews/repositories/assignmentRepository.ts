import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AssignmentStatus, Prisma, ReviewSlot } from "@/lib/generated/prisma/client";

/**
 * Pure data access for ReviewAssignment — see frameworkRepository.ts's
 * doc comment for why this layer stays dumb (no business rules, no
 * permission checks, no audit writes; that's all assignmentService.ts).
 */

/** Statuses that count as "still occupying a slot" — excludes the two terminal off-ramps that free it up for reassignment/history. */
const ACTIVE_STATUSES: AssignmentStatus[] = [
  "PENDING",
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "ESCALATED",
];

export const ASSIGNMENT_WITH_REVIEWER = {
  reviewer: { select: { id: true, name: true, email: true, status: true } },
} satisfies Prisma.ReviewAssignmentInclude;

export function getAssignment(id: string) {
  return prisma.reviewAssignment.findUnique({ where: { id }, include: ASSIGNMENT_WITH_REVIEWER });
}

/** Every row for an application, active and historical (reassigned-away/cancelled included) — for audit/history views. */
export function listAllAssignmentsForApplication(applicationId: string) {
  return prisma.reviewAssignment.findMany({
    where: { applicationId },
    include: ASSIGNMENT_WITH_REVIEWER,
    orderBy: { assignedAt: "asc" },
  });
}

/** Only the currently-active row per slot — what "who is assigned right now" means. */
export function listActiveAssignmentsForApplication(applicationId: string) {
  return prisma.reviewAssignment.findMany({
    where: { applicationId, status: { in: ACTIVE_STATUSES } },
    include: ASSIGNMENT_WITH_REVIEWER,
    orderBy: { slot: "asc" },
  });
}

export function getActiveAssignmentForSlot(applicationId: string, slot: ReviewSlot) {
  return prisma.reviewAssignment.findFirst({
    where: { applicationId, slot, status: { in: ACTIVE_STATUSES } },
  });
}

export function findActiveAssignmentForReviewerAndApplication(reviewerId: string, applicationId: string) {
  return prisma.reviewAssignment.findFirst({
    where: { reviewerId, applicationId, status: { in: ACTIVE_STATUSES } },
  });
}

/** Active assignment count per reviewer — the workload figure the balancing algorithm sorts on. */
export async function countActiveAssignmentsForReviewers(reviewerIds: string[]): Promise<Map<string, number>> {
  if (reviewerIds.length === 0) return new Map();
  const rows = await prisma.reviewAssignment.groupBy({
    by: ["reviewerId"],
    where: { reviewerId: { in: reviewerIds }, status: { in: ACTIVE_STATUSES } },
    _count: { _all: true },
  });
  const counts = new Map(reviewerIds.map((id) => [id, 0]));
  for (const row of rows) counts.set(row.reviewerId, row._count._all);
  return counts;
}

export function createAssignment(
  tx: Prisma.TransactionClient,
  data: Prisma.ReviewAssignmentUncheckedCreateInput,
) {
  return tx.reviewAssignment.create({ data });
}

/**
 * Status-conditioned update — identical pattern to
 * reviewRepository.updateReviewStatus: a write only succeeds if the row
 * is still in `fromStatus`, so a concurrent transition loses cleanly
 * (`count: 0`) instead of silently overwriting.
 */
export function updateAssignmentStatus(
  tx: Prisma.TransactionClient | typeof prisma,
  assignmentId: string,
  fromStatus: AssignmentStatus,
  data: Prisma.ReviewAssignmentUncheckedUpdateManyInput,
) {
  return tx.reviewAssignment.updateMany({ where: { id: assignmentId, status: fromStatus }, data });
}

export function getActiveAssignmentsForReviewerIds(applicationId: string, reviewerIds: string[]) {
  return prisma.reviewAssignment.findMany({
    where: { applicationId, reviewerId: { in: reviewerIds }, status: { in: ACTIVE_STATUSES } },
  });
}

/**
 * Blind review enforcement (§8, docs/BLIND_REVIEW.md): scoped to
 * `reviewerId` in the `where` clause itself, not filtered after the
 * fact — the query can never return another reviewer's assignment, so
 * there is no client-side filtering step to forget or bypass. This is
 * the one function a future Reviewer Workspace (Phase 3C) calls for "my
 * assignments"; nothing else in this module returns assignment rows
 * without either this scoping or an explicit ASSIGNMENTS_VIEW permission
 * check upstream in the service layer.
 */
export function listActiveAssignmentsForReviewer(reviewerId: string) {
  return prisma.reviewAssignment.findMany({
    where: { reviewerId, status: { in: ACTIVE_STATUSES } },
    include: {
      // Applicant name/email and the linked review's status/total (Phase
      // 3C) — additive to the original `{ id, cohortId }` shape, so this
      // stays the one function the Reviewer Workspace list page needs,
      // rather than a second parallel query duplicating the same scoping.
      application: {
        select: {
          id: true,
          cohortId: true,
          applicant: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      review: { select: { id: true, status: true, totalScore: true, submittedAt: true } },
    },
    orderBy: { assignedAt: "asc" },
  });
}
