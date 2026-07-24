import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ConflictSource } from "@/lib/generated/prisma/client";

/** Pure data access for ReviewConflictOfInterest. */

/** True if this reviewer/application pair has a currently-active (unexpired) conflict — what assignment-selection actually excludes on. */
export async function hasActiveConflict(reviewerId: string, applicationId: string): Promise<boolean> {
  const row = await prisma.reviewConflictOfInterest.findUnique({
    where: { reviewerId_applicationId: { reviewerId, applicationId } },
  });
  if (!row) return false;
  return !row.expiresAt || row.expiresAt > new Date();
}

/** Bulk form of hasActiveConflict, for filtering a whole candidate pool in one query. */
export async function listActiveConflictedReviewerIds(applicationId: string, reviewerIds: string[]): Promise<Set<string>> {
  if (reviewerIds.length === 0) return new Set();
  const rows = await prisma.reviewConflictOfInterest.findMany({
    where: {
      applicationId,
      reviewerId: { in: reviewerIds },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { reviewerId: true },
  });
  return new Set(rows.map((r) => r.reviewerId));
}

export function listConflictsForReviewer(reviewerId: string) {
  return prisma.reviewConflictOfInterest.findMany({ where: { reviewerId }, orderBy: { createdAt: "desc" } });
}

export function listConflictsForApplication(applicationId: string) {
  return prisma.reviewConflictOfInterest.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } });
}

export function createConflict(data: {
  reviewerId: string;
  applicationId: string;
  reason: string;
  source: ConflictSource;
  declaredById: string;
  expiresAt?: Date | null;
}) {
  return prisma.reviewConflictOfInterest.upsert({
    where: { reviewerId_applicationId: { reviewerId: data.reviewerId, applicationId: data.applicationId } },
    create: data,
    update: data,
  });
}
