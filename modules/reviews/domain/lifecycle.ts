import type { ReviewStatus } from "@/lib/generated/prisma/client";

import { InvalidStatusTransitionError } from "@/lib/errors";

/**
 * The complete review status graph (§11). NOT_STARTED → IN_PROGRESS →
 * SUBMITTED is the normal *drafting* path, but NOT_STARTED → SUBMITTED
 * directly is also valid — a reviewer who fills in every score and hits
 * "Submit" without ever separately saving a draft first is a normal,
 * common flow, not an error; there is nothing in §11/§12 that requires
 * passing through an intermediate draft state. SUBMITTED → REOPENED →
 * SUBMITTED is a controlled correction (§13) — REOPENED carries the same
 * edit rights as IN_PROGRESS (draft scores can be changed) but is a
 * distinct value so a "reopened, not yet resubmitted" review is visibly
 * different from one that was simply always in progress. RECUSED and
 * CANCELLED are terminal off-ramps, reachable from either open state.
 *
 * This is the *only* place review status transitions are decided —
 * every service that changes `Review.status` calls `assertTransition`
 * first, so "no arbitrary status changes" (§11) is one rule to audit,
 * not one per call site.
 */
const REVIEW_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  NOT_STARTED: ["IN_PROGRESS", "SUBMITTED", "RECUSED", "CANCELLED"],
  IN_PROGRESS: ["SUBMITTED", "RECUSED", "CANCELLED"],
  SUBMITTED: ["REOPENED"],
  REOPENED: ["SUBMITTED", "CANCELLED"],
  RECUSED: [],
  CANCELLED: [],
};

export function canTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return REVIEW_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ReviewStatus, to: ReviewStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStatusTransitionError(`Cannot move a review from ${from} to ${to}.`);
  }
}
