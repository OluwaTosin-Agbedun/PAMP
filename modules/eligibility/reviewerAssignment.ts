import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { Role, type ScreeningStatus } from "@/lib/generated/prisma/client";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import * as repo from "./screeningRepository";

/** Pure — picks one reviewer id uniformly at random from the pool. Exported separately so distribution/edge-case behaviour is unit-testable without a database. */
export function pickRandomReviewer(reviewerIds: string[]): string | null {
  if (reviewerIds.length === 0) return null;
  return reviewerIds[Math.floor(Math.random() * reviewerIds.length)];
}

/**
 * Every ACTIVE account holding the dedicated `ELIGIBILITY_REVIEWER`
 * role — never a hard-coded name, but deliberately scoped to the role
 * itself rather than to everyone holding `ELIGIBILITY_SCREENING_PERFORM`.
 * That broader permission is also granted to Programme Secretary/
 * Director/System Administrator for oversight (they can perform a
 * screening themselves if needed), but they aren't "the reviewers" the
 * random pool should draw from — only the dedicated screener role is.
 * Whoever holds the role today is the pool; granting or revoking the
 * role changes who future random assignments can land on without a
 * code change.
 */
export async function getEligibleReviewerPool(): Promise<string[]> {
  const activeUsers = await prisma.user.findMany({
    where: { status: "ACTIVE", role: Role.ELIGIBILITY_REVIEWER },
    select: { id: true },
  });
  return activeUsers.map((u) => u.id);
}

/**
 * Assigns a random eligible reviewer to one screening, if it doesn't
 * already have one. Called both from the automatic decision engine
 * (`screeningService.ts`, the moment a case is flagged Clarification
 * Required) and from the bulk cohort pass below — idempotent by
 * construction (`assignScreenerIfUnassigned`), so calling it twice on
 * the same screening never reshuffles an existing assignment. Returns
 * `null` without error if the pool is empty (nobody currently holds
 * the permission) or the screening was already assigned.
 */
export async function autoAssignRandomReviewer(
  screeningId: string,
  applicationId: string,
  status: ScreeningStatus,
): Promise<string | null> {
  const pool = await getEligibleReviewerPool();
  const reviewerId = pickRandomReviewer(pool);
  if (!reviewerId) return null;

  const assigned = await repo.assignScreenerIfUnassigned(screeningId, { screenerId: reviewerId, status });
  if (!assigned) return null;

  await writeAuditLog({
    actorId: null,
    action: AUDIT_ACTIONS.ELIGIBILITY_SCREENER_ASSIGNED,
    entityType: "EligibilityScreening",
    entityId: screeningId,
    metadata: { applicationId, screenerId: reviewerId, automatic: true },
  });

  return reviewerId;
}

/**
 * Backfills every screening in the cohort that still needs a human
 * (i.e. hasn't reached a terminal decision) and has no reviewer yet —
 * the on-demand counterpart to the automatic per-decision hook, for
 * applications that existed before this feature did, or a pool change
 * that leaves stragglers unassigned.
 */
export async function autoAssignRandomReviewersForCohort(actorId: string, cohortId: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.ELIGIBILITY_SCREENING_ASSIGN);

  const pending = await prisma.eligibilityScreening.findMany({
    where: {
      screenerId: null,
      status: { notIn: ["ELIGIBLE", "INELIGIBLE", "DISQUALIFIED"] },
      application: { cohortId, deletedAt: null },
    },
    select: { id: true, applicationId: true, status: true },
  });

  const distribution: Record<string, number> = {};
  let assignedCount = 0;
  for (const screening of pending) {
    const reviewerId = await autoAssignRandomReviewer(screening.id, screening.applicationId, screening.status);
    if (reviewerId) {
      assignedCount++;
      distribution[reviewerId] = (distribution[reviewerId] ?? 0) + 1;
    }
  }

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.ELIGIBILITY_SCREENER_ASSIGNED,
    entityType: "Cohort",
    entityId: cohortId,
    metadata: { outcome: "BULK_RANDOM_ASSIGNMENT", processed: pending.length, assigned: assignedCount, distribution },
  });

  // Audit metadata references reviewers by id (stable); the returned
  // summary resolves to names, since it's read directly by an admin in
  // a toast, not stored.
  const reviewers = await prisma.user.findMany({ where: { id: { in: Object.keys(distribution) } }, select: { id: true, name: true } });
  const nameById = new Map(reviewers.map((r) => [r.id, r.name]));
  const distributionByName = Object.fromEntries(
    Object.entries(distribution).map(([id, count]) => [nameById.get(id) ?? id, count]),
  );

  return { processed: pending.length, assigned: assignedCount, distribution: distributionByName };
}
