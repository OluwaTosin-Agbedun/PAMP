import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

// "Assigned or completed" — every status except REASSIGNED (superseded)
// and CANCELLED (truly unassigned). Must include COMPLETED: a
// fully-submitted, non-diverging pair moves its assignments to
// COMPLETED (see assignmentService.checkAndHandleEscalation) and this
// list still needs to show that reviewer's score/comment for oversight
// — see the same fix in assignmentMonitoringRepository.ts. The page
// itself filters this down further (REASSIGNABLE_STATUSES) before
// offering assignments as reassignment candidates, so widening this
// list doesn't let a completed review be reassigned.
const ACTIVE_STATUSES: Prisma.ReviewAssignmentWhereInput["status"] = {
  in: ["PENDING", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "SUBMITTED", "ESCALATED", "COMPLETED"],
};

export function getApplicationForOperations(applicationId: string) {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      applicant: { select: { firstName: true, lastName: true, email: true, externalRef: true } },
      cohort: { select: { id: true, programmeId: true, name: true } },
    },
  });
}

export function listActiveAssignmentsForApplication(applicationId: string) {
  return prisma.reviewAssignment.findMany({
    where: { applicationId, status: ACTIVE_STATUSES },
    include: {
      reviewer: { select: { id: true, name: true, status: true } },
      review: { select: { id: true, status: true, totalScore: true, comments: true, submittedAt: true } },
    },
    orderBy: { slot: "asc" },
  });
}

export function listAllAssignmentsHistoryForApplication(applicationId: string) {
  return prisma.reviewAssignment.findMany({
    where: { applicationId },
    include: { reviewer: { select: { id: true, name: true } } },
    orderBy: { assignedAt: "asc" },
  });
}

export function listConflictsForApplication(applicationId: string) {
  return prisma.reviewConflictOfInterest.findMany({
    where: { applicationId },
    include: { reviewer: { select: { id: true, name: true } }, declaredBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export function getEscalationForApplication(applicationId: string) {
  return prisma.reviewEscalation.findFirst({
    where: { applicationId },
    include: {
      firstReview: { select: { totalScore: true, reviewer: { select: { name: true } } } },
      secondReview: { select: { totalScore: true, reviewer: { select: { name: true } } } },
      thirdReviewAssignment: {
        select: {
          status: true,
          reviewer: { select: { name: true } },
          review: { select: { status: true, totalScore: true, comments: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
