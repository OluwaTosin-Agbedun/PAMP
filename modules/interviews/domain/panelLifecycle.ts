import type { PanelistAssignmentStatus } from "@/lib/generated/prisma/client";

import { InvalidStatusTransitionError } from "@/lib/errors";

/**
 * The complete panelist-assignment status graph (Release 1 Module 1) —
 * same "one authoritative transition table" pattern as
 * `modules/reviews/domain/assignmentLifecycle.ts`. Simpler than the
 * review assignment graph: there is no scoring-progress state here
 * (`InterviewScore.status` tracks that separately, per panelist) — a
 * panel seat is either held (`ASSIGNED`) or it isn't
 * (`REASSIGNED`/`CANCELLED`, both terminal).
 */
const PANELIST_TRANSITIONS: Record<PanelistAssignmentStatus, PanelistAssignmentStatus[]> = {
  ASSIGNED: ["REASSIGNED", "CANCELLED"],
  REASSIGNED: [],
  CANCELLED: [],
};

export function canTransitionPanelist(from: PanelistAssignmentStatus, to: PanelistAssignmentStatus): boolean {
  return PANELIST_TRANSITIONS[from].includes(to);
}

export function assertPanelistTransition(from: PanelistAssignmentStatus, to: PanelistAssignmentStatus): void {
  if (!canTransitionPanelist(from, to)) {
    throw new InvalidStatusTransitionError(`Cannot move a panelist assignment from ${from} to ${to}.`);
  }
}
