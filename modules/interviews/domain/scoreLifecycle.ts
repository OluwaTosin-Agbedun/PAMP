import type { ScoreSubmissionStatus } from "@/lib/generated/prisma/client";

import { InvalidStatusTransitionError } from "@/lib/errors";

/**
 * The complete InterviewScore status graph — deliberately simpler than
 * Review's (modules/reviews/domain/lifecycle.ts): `ScoreSubmissionStatus`
 * has no IN_PROGRESS/REOPENED/CANCELLED/NOT_STARTED, so there is no
 * reopen flow to model here. A panellist's score stays DRAFT through any
 * number of autosaves, then moves to SUBMITTED (terminal) or RECUSED
 * (terminal, off-ramp — a panellist who has a conflict discovered
 * mid-interview). Reopening a submitted interview score, if ever needed,
 * is new scope, not a gap in this table.
 */
const SCORE_TRANSITIONS: Record<ScoreSubmissionStatus, ScoreSubmissionStatus[]> = {
  DRAFT: ["SUBMITTED", "RECUSED"],
  SUBMITTED: [],
  RECUSED: [],
};

export function canTransitionScore(from: ScoreSubmissionStatus, to: ScoreSubmissionStatus): boolean {
  return SCORE_TRANSITIONS[from].includes(to);
}

export function assertScoreTransition(from: ScoreSubmissionStatus, to: ScoreSubmissionStatus): void {
  if (!canTransitionScore(from, to)) {
    throw new InvalidStatusTransitionError(`Cannot move an interview score from ${from} to ${to}.`);
  }
}
