import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AssignmentStatus, Prisma } from "@/lib/generated/prisma/client";

/**
 * The Secretariat-facing "one row per application" read model behind the
 * Assignment Monitoring table (Phase 3D) — deliberately separate from
 * `modules/reviews/repositories/assignmentRepository.ts`, which is
 * shaped for the assignment *engine* (one row per assignment, scoped to
 * a single reviewer or a single application). This module's queries are
 * oversight-shaped: broad, joined across reviewers/applications, gated
 * upstream by `review_operations.view`/`review_assignments.view`, never
 * by `reviewerId` scoping — see docs/PROGRAMME_SECRETARIAT_WORKSPACE.md.
 */

// "Assigned or completed" — every status except REASSIGNED (superseded
// by the newer row that replaced it) and CANCELLED (truly unassigned).
// Must include COMPLETED: a fully-submitted, non-diverging pair moves to
// COMPLETED (see modules/reviews/services/assignmentService.ts's
// checkAndHandleEscalation) and must still appear in this table as
// "Submitted," not silently disappear from the reviewers list.
const ASSIGNED_OR_COMPLETED_STATUSES: AssignmentStatus[] = [
  "PENDING",
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "ESCALATED",
  "COMPLETED",
];

const ASSIGNMENT_INCLUDE = {
  reviewer: { select: { id: true, name: true, email: true } },
  review: { select: { id: true, status: true, totalScore: true, submittedAt: true } },
} satisfies Prisma.ReviewAssignmentInclude;

export type RawAssignmentRow = Prisma.ReviewAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

/**
 * Loads every candidate application in the cohort (optionally narrowed
 * by pathway or a search term) together with its active assignments,
 * conflicts, and escalations, in a handful of flat queries — grouping
 * and the remaining filters happen in the service layer. Correct and
 * simple at this system's documented scale (a few hundred applications
 * per cohort — the same scale Sequence 1's import already assumes), not
 * a premature two-phase SQL-paginated join. See
 * docs/adr/ADR-review-operations-read-model.md.
 */
export async function loadMonitoringDataset(cohortId: string, pathway?: string) {
  const applications = await prisma.application.findMany({
    where: {
      cohortId,
      eligibilityStatus: "ELIGIBLE",
      ...(pathway ? { pathway } : {}),
    },
    select: {
      id: true,
      pathway: true,
      createdAt: true,
      applicant: { select: { firstName: true, lastName: true, email: true, externalRef: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  // Deliberately no "return early if applicationIds is empty" special
  // case — `findMany({ where: { id: { in: [] } } })` already resolves to
  // `[]` with the exact same include-derived type as the populated case,
  // so a manual empty-array literal here would only risk the two branches'
  // inferred types silently drifting apart.
  const applicationIds = applications.map((a) => a.id);

  const [assignments, conflicts, escalations] = await Promise.all([
    prisma.reviewAssignment.findMany({
      where: { applicationId: { in: applicationIds }, status: { in: ASSIGNED_OR_COMPLETED_STATUSES } },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { slot: "asc" },
    }),
    prisma.reviewConflictOfInterest.findMany({
      where: { applicationId: { in: applicationIds } },
      select: { applicationId: true, reviewerId: true, reason: true, source: true, expiresAt: true },
    }),
    prisma.reviewEscalation.findMany({
      where: { applicationId: { in: applicationIds } },
      select: {
        id: true,
        applicationId: true,
        scoreDifference: true,
        thresholdApplied: true,
        thirdReviewAssignmentId: true,
        resolvedFinalScore: true,
        resolvedAt: true,
        createdAt: true,
      },
    }),
  ]);

  return { applications, assignments, conflicts, escalations };
}

export async function getActiveReviewStageForCohort(programmeId: string, cohortId: string) {
  return prisma.reviewStage.findFirst({
    where: { programmeId, OR: [{ cohortId }, { cohortId: null }], status: "ACTIVE" },
    orderBy: { sequenceOrder: "asc" },
  });
}

export function listDistinctPathways(cohortId: string) {
  return prisma.application
    .findMany({
      where: { cohortId, pathway: { not: null } },
      select: { pathway: true },
      distinct: ["pathway"],
      orderBy: { pathway: "asc" },
    })
    .then((rows) => rows.map((r) => r.pathway).filter((p): p is string => Boolean(p)));
}

export function listActiveApplicationReviewers() {
  return prisma.user.findMany({
    where: { role: "APPLICATION_REVIEWER", status: "ACTIVE" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}
