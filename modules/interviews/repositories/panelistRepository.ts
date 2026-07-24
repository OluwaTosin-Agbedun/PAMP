import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma, PanelistAssignmentStatus } from "@/lib/generated/prisma/client";

/**
 * Pure data access for InterviewPanelist — no business rules, no
 * permission checks, no audit writes; that's all
 * services/panelAssignmentService.ts. Mirrors
 * modules/reviews/repositories/assignmentRepository.ts's shape exactly.
 */

const ACTIVE_STATUSES: PanelistAssignmentStatus[] = ["ASSIGNED"];

export const PANELIST_WITH_USER = {
  user: { select: { id: true, name: true, email: true, status: true } },
} satisfies Prisma.InterviewPanelistInclude;

export function getPanelist(id: string) {
  return prisma.interviewPanelist.findUnique({ where: { id }, include: PANELIST_WITH_USER });
}

/** Every row for an interview, active and historical — for audit/history views. */
export function listAllPanelistsForInterview(interviewId: string) {
  return prisma.interviewPanelist.findMany({
    where: { interviewId },
    include: PANELIST_WITH_USER,
    orderBy: { assignedAt: "asc" },
  });
}

/** Only the currently-held seats — what "who is on this panel right now" means. */
export function listActivePanelistsForInterview(interviewId: string) {
  return prisma.interviewPanelist.findMany({
    where: { interviewId, status: { in: ACTIVE_STATUSES } },
    include: PANELIST_WITH_USER,
    orderBy: { assignedAt: "asc" },
  });
}

export function createPanelist(tx: Prisma.TransactionClient, data: Prisma.InterviewPanelistUncheckedCreateInput) {
  return tx.interviewPanelist.create({ data });
}

/** Status-conditioned update — a write only succeeds if the row is still in `fromStatus`. */
export function updatePanelistStatus(
  tx: Prisma.TransactionClient | typeof prisma,
  panelistId: string,
  fromStatus: PanelistAssignmentStatus,
  data: Prisma.InterviewPanelistUncheckedUpdateManyInput,
) {
  return tx.interviewPanelist.updateMany({ where: { id: panelistId, status: fromStatus }, data });
}

export function getActivePanelistsForUserIds(interviewId: string, userIds: string[]) {
  return prisma.interviewPanelist.findMany({
    where: { interviewId, userId: { in: userIds }, status: { in: ACTIVE_STATUSES } },
  });
}

/**
 * Every interview a user currently holds an active panel seat on — for
 * "my interview queue" (Module 2) and workload counts. `interview.scores`
 * is filtered to this same userId (InterviewScore has no direct FK back
 * to InterviewPanelist — it's keyed on `[interviewId, panelistId]` — so
 * this is the one query that gets "my own score status per interview"
 * without an N+1 lookup per row), never another panellist's.
 */
export function listActivePanelistRowsForUser(userId: string) {
  return prisma.interviewPanelist.findMany({
    where: { userId, status: { in: ACTIVE_STATUSES } },
    include: {
      interview: {
        include: {
          application: { include: { applicant: true } },
          scores: { where: { panelistId: userId }, select: { status: true, totalScore: true } },
        },
      },
    },
    orderBy: { interview: { scheduledAt: "asc" } },
  });
}

export function countActivePanelSeats(userIds: string[]) {
  return prisma.interviewPanelist.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, status: { in: ACTIVE_STATUSES } },
    _count: { _all: true },
  });
}

export function listInterviewerCapacities(interviewerIds: string[], programmeId: string) {
  return prisma.interviewerCapacity.findMany({ where: { interviewerId: { in: interviewerIds }, programmeId } });
}

export function getInterviewerCapacity(interviewerId: string, programmeId: string) {
  return prisma.interviewerCapacity.findUnique({ where: { interviewerId_programmeId: { interviewerId, programmeId } } });
}

export function upsertInterviewerCapacity(
  interviewerId: string,
  programmeId: string,
  data: { maxConcurrentInterviews?: number; isAvailable?: boolean; unavailableReason?: string | null; unavailableUntil?: Date | null },
) {
  return prisma.interviewerCapacity.upsert({
    where: { interviewerId_programmeId: { interviewerId, programmeId } },
    create: { interviewerId, programmeId, ...data },
    update: data,
  });
}

export function listActiveInterviewers() {
  return prisma.user.findMany({
    where: { role: "INTERVIEWER", status: "ACTIVE" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}
