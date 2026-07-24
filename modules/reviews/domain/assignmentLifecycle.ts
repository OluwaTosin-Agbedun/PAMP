import type { AssignmentStatus } from "@/lib/generated/prisma/client";

import { InvalidStatusTransitionError } from "@/lib/errors";

/**
 * The complete assignment status graph (Phase 3B §5) — the same
 * "one authoritative transition table" pattern as the review lifecycle
 * (modules/reviews/domain/lifecycle.ts). `PENDING` is reserved for a
 * future notification-gated flow (no code path produces it this phase —
 * see the enum's doc comment in schema.prisma). `ASSIGNED`/`ACCEPTED`
 * can both go straight to `SUBMITTED`, mirroring the review lifecycle's
 * `NOT_STARTED → SUBMITTED` direct edge (Phase 3A) — a reviewer isn't
 * required to pass through `IN_PROGRESS` first. `ESCALATED` only follows
 * `SUBMITTED` (only known once both reviewers in a pair have submitted
 * and their scores diverge — see docs/THIRD_REVIEW_ENGINE.md).
 * `REASSIGNED`/`CANCELLED`/`COMPLETED` are terminal.
 */
const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  PENDING: ["ASSIGNED"],
  ASSIGNED: ["ACCEPTED", "IN_PROGRESS", "SUBMITTED", "CANCELLED", "REASSIGNED"],
  ACCEPTED: ["IN_PROGRESS", "SUBMITTED", "CANCELLED", "REASSIGNED"],
  IN_PROGRESS: ["SUBMITTED", "CANCELLED", "REASSIGNED"],
  SUBMITTED: ["ESCALATED", "COMPLETED"],
  ESCALATED: ["COMPLETED"],
  REASSIGNED: [],
  CANCELLED: [],
  COMPLETED: [],
};

export function canTransitionAssignment(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return ASSIGNMENT_TRANSITIONS[from].includes(to);
}

export function assertAssignmentTransition(from: AssignmentStatus, to: AssignmentStatus): void {
  if (!canTransitionAssignment(from, to)) {
    throw new InvalidStatusTransitionError(`Cannot move an assignment from ${from} to ${to}.`);
  }
}
