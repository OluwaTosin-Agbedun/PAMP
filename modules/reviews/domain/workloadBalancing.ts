/**
 * The workload balancing algorithm (Phase 3B §6) — pure, no I/O. Takes
 * an already-loaded snapshot of candidate reviewers and picks the
 * requested number with the lightest active load.
 *
 * Where workloads are equal, the brief permits either random or
 * round-robin tie-breaking "while maintaining deterministic
 * auditability." This keeps Sequence 1's existing tie-break (a random
 * shuffle before the stable sort by load) rather than switching to
 * round-robin — reusing the already-built, already-tested behavior per
 * the standing "reuse existing models/logic, minimal changes" guidance,
 * not introducing a second competing algorithm. "Deterministic
 * auditability" is satisfied by *recording* exactly who was selected and
 * what each candidate's load was at decision time (the assignment
 * service writes this into the audit entry's metadata) — not by making
 * the selection itself reproducible. A future weighted-capacity or
 * specialist-reviewer requirement is additive here: `ReviewerWorkload`
 * already carries `capacity`, so "weight" is one more field and one more
 * sort key, not a rewrite of this function's shape.
 */
export type ReviewerWorkload = {
  reviewerId: string;
  activeAssignmentCount: number;
  maxConcurrentAssignments: number;
};

export type ReviewerSelectionResult = {
  selected: string[];
  /** Every eligible-but-unpicked candidate, in the order they were passed over — useful for audit/debugging, not required for the pick itself. */
  remaining: string[];
};

/** A candidate at or over its capacity is never selected — enforced here, not left to the caller to remember. */
export function isAtCapacity(candidate: ReviewerWorkload): boolean {
  return candidate.activeAssignmentCount >= candidate.maxConcurrentAssignments;
}

export function selectLeastLoadedReviewers(
  candidates: ReviewerWorkload[],
  count: number,
): ReviewerSelectionResult {
  const withCapacity = candidates.filter((c) => !isAtCapacity(c));

  // Random tie-break, then a stable sort by ascending load — same
  // two-step Sequence 1 already used in modules/reviews/assignment.ts.
  const shuffled = [...withCapacity].sort(() => Math.random() - 0.5);
  const byLoad = shuffled.sort((a, b) => a.activeAssignmentCount - b.activeAssignmentCount);

  const selected = byLoad.slice(0, count).map((c) => c.reviewerId);
  const remaining = byLoad.slice(count).map((c) => c.reviewerId);

  return { selected, remaining };
}
