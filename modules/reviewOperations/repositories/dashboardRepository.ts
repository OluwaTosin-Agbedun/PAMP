import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AssignmentStatus } from "@/lib/generated/prisma/client";

/**
 * Pure data access for the review operations dashboard (Phase 3D) — one
 * focused query per metric rather than a single giant join, so each
 * number is independently correct and independently testable. All
 * scoped by `cohortId` — the existing isolation boundary this codebase
 * already uses everywhere else (`lib/cohort.ts`), not a new one invented
 * for this phase.
 */

/** "Currently in flight" — excludes the three terminal statuses (COMPLETED, REASSIGNED, CANCELLED). Used for current-load/completion-denominator figures, where a finished assignment shouldn't count as still "active." */
const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  "PENDING",
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "ESCALATED",
];

/** "Ever meaningfully assigned" — active statuses *plus* COMPLETED, excluding only REASSIGNED (superseded by a newer row, already counted through it) and CANCELLED (truly unassigned). Used for "is this application assigned at all" figures, where a fully-completed review must still count as assigned. */
const ASSIGNED_STATUSES: AssignmentStatus[] = [...ACTIVE_ASSIGNMENT_STATUSES, "COMPLETED"];

export function countEligibleApplications(cohortId: string) {
  return prisma.application.count({ where: { cohortId, eligibilityStatus: "ELIGIBLE" } });
}

/** Distinct applications with at least one assigned-or-completed (non-reassigned/cancelled) assignment. */
export async function countApplicationsAssigned(cohortId: string): Promise<number> {
  const rows = await prisma.reviewAssignment.findMany({
    where: {
      status: { in: ASSIGNED_STATUSES },
      application: { cohortId, eligibilityStatus: "ELIGIBLE" },
    },
    distinct: ["applicationId"],
    select: { applicationId: true },
  });
  return rows.length;
}

export function countReviewsByStatus(cohortId: string, statuses: string[]) {
  return prisma.review.count({
    where: {
      status: { in: statuses as never[] },
      reviewAssignment: { application: { cohortId } },
    },
  });
}

/**
 * Active assignments with no `Review` row at all — created lazily on a
 * reviewer's first visit to the scoring page (Phase 3C), so an assignment
 * nobody has opened yet has none. These count as "not started" alongside
 * `Review` rows whose status literally is `NOT_STARTED` (a review that
 * was opened but never had a score saved) — both are the same thing from
 * the Secretariat's point of view.
 */
export function countAssignmentsWithoutReview(cohortId: string) {
  return prisma.reviewAssignment.count({
    where: {
      status: { in: ACTIVE_ASSIGNMENT_STATUSES },
      application: { cohortId },
      review: null,
    },
  });
}

/**
 * The one active Application Review stage for a programme/cohort — same
 * resolution `reviewService.createReview` already uses (Phase 3A: V1.0
 * has exactly one applicable stage). Its `closesAt` is what this phase
 * treats as every assignment's due date — there's no per-assignment due
 * date field in the schema, and the stage's own configured close date is
 * exactly what "due" already means elsewhere in this codebase (a review
 * assignment created after this stage closes, or still open when it
 * does, is overdue). See docs/REVIEW_MONITORING_AND_ESCALATION.md.
 */
export function getActiveReviewStage(programmeId: string, cohortId: string) {
  return prisma.reviewStage.findFirst({
    where: { programmeId, OR: [{ cohortId }, { cohortId: null }], status: "ACTIVE" },
    orderBy: { sequenceOrder: "asc" },
  });
}

/**
 * An active, not-yet-submitted assignment counts as overdue once the
 * stage's `closesAt` has passed — independent of whether a `Review` row
 * exists yet (one is only created lazily, on the reviewer's first visit
 * to the scoring page), so this can't be computed by joining through
 * `Review` the way a naive query might.
 */
export async function countOverdueAssignments(cohortId: string, programmeId: string): Promise<number> {
  const stage = await getActiveReviewStage(programmeId, cohortId);
  if (!stage?.closesAt || stage.closesAt > new Date()) return 0;

  return prisma.reviewAssignment.count({
    where: {
      status: { in: ["PENDING", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"] },
      application: { cohortId },
    },
  });
}

export function countRecusals(cohortId: string) {
  return prisma.review.count({
    where: { status: "RECUSED", reviewAssignment: { application: { cohortId } } },
  });
}

export function countReassignments(cohortId: string) {
  return prisma.reviewAssignment.count({
    where: { status: "REASSIGNED", application: { cohortId } },
  });
}

export function countConflictDeclarations(cohortId: string) {
  return prisma.reviewConflictOfInterest.count({ where: { application: { cohortId } } });
}

export function countEscalations(cohortId: string) {
  return prisma.reviewEscalation.count({ where: { application: { cohortId } } });
}

export function countOutstandingEscalations(cohortId: string) {
  return prisma.reviewEscalation.count({
    where: { application: { cohortId }, resolvedFinalScore: null },
  });
}

export function countActiveAssignmentsTotal(cohortId: string) {
  return prisma.reviewAssignment.count({
    where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES }, application: { cohortId } },
  });
}

export function countCompletedAssignments(cohortId: string) {
  return prisma.reviewAssignment.count({
    where: { status: "COMPLETED", application: { cohortId } },
  });
}

/**
 * Release 1.5 Risk Dashboard — active, unsubmitted assignments whose
 * stage closes within `withinDays` but hasn't closed yet (an already-
 * closed stage's assignments are "overdue," a different, already-
 * existing metric, not "approaching"). Reuses the same stage-window
 * resolution `countOverdueAssignments` above already established.
 */
export async function countApplicationsApproachingDeadline(cohortId: string, programmeId: string, withinDays: number): Promise<number> {
  const stage = await getActiveReviewStage(programmeId, cohortId);
  if (!stage?.closesAt) return 0;

  const now = new Date();
  const horizon = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
  if (stage.closesAt <= now || stage.closesAt > horizon) return 0;

  const rows = await prisma.reviewAssignment.findMany({
    where: { status: { in: ["PENDING", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"] }, application: { cohortId } },
    distinct: ["applicationId"],
    select: { applicationId: true },
  });
  return rows.length;
}

/**
 * The average time between an assignment being made and its review
 * being submitted, across every completed review this cohort — a plain
 * arithmetic mean over two already-stored timestamps
 * (`ReviewAssignment.assignedAt`, `Review.submittedAt`), not a new
 * business rule.
 */
export async function getAverageCompletionHours(cohortId: string): Promise<number | null> {
  const rows = await prisma.review.findMany({
    where: { status: "SUBMITTED", submittedAt: { not: null }, reviewAssignment: { application: { cohortId } } },
    select: { submittedAt: true, reviewAssignment: { select: { assignedAt: true } } },
  });
  if (rows.length === 0) return null;

  const totalHours = rows.reduce((sum, r) => {
    const hours = (r.submittedAt!.getTime() - r.reviewAssignment.assignedAt.getTime()) / (1000 * 60 * 60);
    return sum + hours;
  }, 0);
  return totalHours / rows.length;
}

/**
 * An assignment still open (`ASSIGNED`/`ACCEPTED`/`IN_PROGRESS`, never
 * even reached `SUBMITTED`) that's been sitting for longer than
 * `staleDays` since it was made — the Secretariat's "nobody's touched
 * this in a while" signal, distinct from "overdue" (which is about the
 * *stage's* close date, not this specific assignment's age).
 */
export async function countStalledApplications(cohortId: string, staleDays: number): Promise<number> {
  const threshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.reviewAssignment.findMany({
    where: { status: { in: ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"] }, assignedAt: { lt: threshold }, application: { cohortId } },
    distinct: ["applicationId"],
    select: { applicationId: true },
  });
  return rows.length;
}

/**
 * Distinct applications where a conflict of interest has been declared
 * against the reviewer currently holding an active assignment slot —
 * the conflict excludes that reviewer from the application, but nothing
 * has reassigned the slot yet. Reuses `ReviewConflictOfInterest`
 * (Phase 3B) and the active-assignment status set; invents no new
 * "awaiting reassignment" state, since this system's reassignment flow
 * is atomic (the replacement assignment is created in the same
 * transaction that closes the old one) — this is the one real gap that
 * can exist between "a conflict was recorded" and "the Secretariat has
 * acted on it."
 */
export async function countApplicationsAwaitingReassignment(cohortId: string): Promise<number> {
  const activeAssignments = await prisma.reviewAssignment.findMany({
    where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES }, application: { cohortId } },
    select: { applicationId: true, reviewerId: true },
  });
  if (activeAssignments.length === 0) return 0;

  const conflicts = await prisma.reviewConflictOfInterest.findMany({
    where: { applicationId: { in: activeAssignments.map((a) => a.applicationId) } },
    select: { applicationId: true, reviewerId: true },
  });
  const conflictKeys = new Set(conflicts.map((c) => `${c.applicationId}:${c.reviewerId}`));

  const affected = new Set(
    activeAssignments.filter((a) => conflictKeys.has(`${a.applicationId}:${a.reviewerId}`)).map((a) => a.applicationId),
  );
  return affected.size;
}

/** Active-assignment count and configured capacity per Application Reviewer active in this programme. */
export async function listReviewerLoadForUtilisation(programmeId: string) {
  const reviewers = await prisma.user.findMany({
    where: { role: "APPLICATION_REVIEWER", status: "ACTIVE" },
    select: { id: true },
  });
  const reviewerIds = reviewers.map((r) => r.id);
  if (reviewerIds.length === 0) return [];

  const [counts, capacities] = await Promise.all([
    prisma.reviewAssignment.groupBy({
      by: ["reviewerId"],
      where: { reviewerId: { in: reviewerIds }, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
      _count: { _all: true },
    }),
    prisma.reviewerCapacity.findMany({ where: { reviewerId: { in: reviewerIds }, programmeId } }),
  ]);

  const countByReviewer = new Map(counts.map((c) => [c.reviewerId, c._count._all]));
  const capacityByReviewer = new Map(capacities.map((c) => [c.reviewerId, c.maxConcurrentAssignments]));

  return reviewerIds.map((id) => ({
    reviewerId: id,
    activeAssignmentCount: countByReviewer.get(id) ?? 0,
    maxConcurrentAssignments: capacityByReviewer.get(id) ?? 10,
  }));
}
