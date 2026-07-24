import "server-only";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";

import * as repo from "../repositories/workloadRepository";

export type ReviewerWorkloadRow = {
  reviewerId: string;
  name: string;
  email: string;
  accountStatus: string;
  activeAssignmentCount: number;
  completedAssignmentCount: number;
  maxConcurrentAssignments: number;
  utilisationPercent: number;
  isAvailable: boolean;
  unavailableReason: string | null;
};

/** Reviewer Workload view (Phase 3D) — gated by `reviewer_capacity.view` (Phase 3B, reused, not duplicated). */
export async function getReviewerWorkload(actorId: string, programmeId: string): Promise<ReviewerWorkloadRow[]> {
  await requirePermission(actorId, PERMISSIONS.REVIEWER_CAPACITY_VIEW);

  const rows = await repo.listReviewerWorkload(programmeId);
  return rows.map((r) => ({
    ...r,
    utilisationPercent: r.maxConcurrentAssignments > 0 ? Math.round((r.activeAssignmentCount / r.maxConcurrentAssignments) * 100) : 0,
  }));
}
