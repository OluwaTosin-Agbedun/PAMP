import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AssignmentStatus } from "@/lib/generated/prisma/client";

const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  "PENDING",
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "ESCALATED",
];

export async function listReviewerWorkload(programmeId: string) {
  const reviewers = await prisma.user.findMany({
    where: { role: "APPLICATION_REVIEWER" },
    select: { id: true, name: true, email: true, status: true },
    orderBy: { name: "asc" },
  });
  const reviewerIds = reviewers.map((r) => r.id);
  if (reviewerIds.length === 0) return [];

  const [activeCounts, completedCounts, capacities] = await Promise.all([
    prisma.reviewAssignment.groupBy({
      by: ["reviewerId"],
      where: { reviewerId: { in: reviewerIds }, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
      _count: { _all: true },
    }),
    prisma.reviewAssignment.groupBy({
      by: ["reviewerId"],
      where: { reviewerId: { in: reviewerIds }, status: "COMPLETED" },
      _count: { _all: true },
    }),
    prisma.reviewerCapacity.findMany({ where: { reviewerId: { in: reviewerIds }, programmeId } }),
  ]);

  const activeByReviewer = new Map(activeCounts.map((c) => [c.reviewerId, c._count._all]));
  const completedByReviewer = new Map(completedCounts.map((c) => [c.reviewerId, c._count._all]));
  const capacityByReviewer = new Map(capacities.map((c) => [c.reviewerId, c]));

  return reviewers.map((reviewer) => {
    const capacity = capacityByReviewer.get(reviewer.id);
    return {
      reviewerId: reviewer.id,
      name: reviewer.name,
      email: reviewer.email,
      accountStatus: reviewer.status,
      activeAssignmentCount: activeByReviewer.get(reviewer.id) ?? 0,
      completedAssignmentCount: completedByReviewer.get(reviewer.id) ?? 0,
      maxConcurrentAssignments: capacity?.maxConcurrentAssignments ?? 10,
      isAvailable: capacity?.isAvailable ?? true,
      unavailableReason: capacity?.unavailableReason ?? null,
    };
  });
}
