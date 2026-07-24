# ADR-0007: Review Assignment Algorithm and Lifecycle Reuse

**Status**: Accepted (Phase 3B)

## Context

Phase 3B needed a workload-balancing algorithm for automatic
first/second-reviewer assignment (§6 of the brief: "distribute
applications as evenly as possible... random or round-robin tie-break
while maintaining deterministic auditability"), and needed to model an
`AssignmentStatus` lifecycle for `ReviewAssignment` alongside the
existing `ReviewStatus` lifecycle for `Review` (Phase 3A).

Two decisions were made together because they share the same underlying
principle — reuse an existing, already-correct pattern rather than
design a new one that happens to look similar.

## Decision

### 1. Workload balancing: reuse Sequence 1's shuffle-then-sort, don't replace it

Sequence 1's original `autoAssignReviewers` already balanced load with:
random shuffle of candidates → stable sort by ascending active-assignment
count → take the first N. This became
`modules/reviews/domain/workloadBalancing.ts`'s `selectLeastLoadedReviewers`,
extracted into a pure, unit-testable function and extended with a
capacity filter, but the core algorithm is unchanged.

### 2. Assignment lifecycle: one shared error class, not a parallel one

`ReviewAssignment` needed the exact same shape of rule Phase 3A already
built for `Review`: a single authoritative transition table
(`modules/reviews/domain/assignmentLifecycle.ts`'s
`ASSIGNMENT_TRANSITIONS`, mirroring `lifecycle.ts`'s `REVIEW_TRANSITIONS`)
that every status-changing service call goes through via
`assertAssignmentTransition`. Rather than adding a second,
near-identical `InvalidAssignmentTransitionError` alongside Phase 3A's
`InvalidReviewTransitionError`, the existing class was renamed in place
to the entity-agnostic `InvalidStatusTransitionError` and both lifecycles
now throw it.

## Alternatives considered

**Round-robin instead of shuffle-then-sort.** The brief explicitly
permits either. Round-robin requires a persisted "whose turn is it next"
cursor (or re-deriving it from historical assignment order every time,
which is more expensive and no more auditable) and offers no behavioral
advantage over load-based sorting once a capacity filter already exists
— load-based sorting inherently accounts for a reviewer who's been
temporarily unavailable and has fallen behind, which a naive round-robin
cursor would not. Rejected in favor of reusing the proven, already-tested
Sequence 1 behavior.

**A separate `InvalidAssignmentTransitionError` class.** Would have been
the simpler one-file change in isolation, but directly conflicts with
this session's standing instruction to refactor an earlier
implementation rather than add duplicate logic when a later phase needs
the same shape of rule for a new entity. Two classes representing the
identical concept (a rejected state-machine transition) for two
different entities is exactly the kind of duplication that instruction
rules out. Rejected.

**A generic `StateMachine<T>` abstraction shared by both lifecycles.**
Considered and rejected as premature: two transition tables (six and
nine states respectively) with materially different edges (`Review` has
no `ESCALATED` equivalent; `ReviewAssignment` has no `REOPENED`
equivalent) don't yet show enough structural overlap to justify a shared
generic — "three similar lines is better than a premature abstraction."
If a third status-lifecycle entity appears in a later phase with the
same shape again, that's the point to reconsider.

## Consequences

- `assignmentLifecycle.ts` and `lifecycle.ts` remain two separate,
  explicit transition tables — easy to read and audit independently —
  while sharing one error type, so every "no arbitrary status change"
  check in the codebase (Review or ReviewAssignment) is one rule to
  verify, not two.
- `workloadBalancing.ts`'s tie-break is non-deterministic by design
  (a real shuffle) — "deterministic auditability" is satisfied by the
  audit trail recording exactly who was picked and why, not by the
  selection itself being reproducible. Anyone auditing an assignment
  reads the `REVIEW_ASSIGNED`/`REVIEW_THIRD_REVIEWER_ASSIGNED` audit
  entry, not the algorithm's internal state.
- Renaming `InvalidReviewTransitionError` was a breaking rename for any
  code referencing the old name; all five reference sites (the class
  itself, its barrel export, `lifecycle.ts`'s throw site, and the two
  test files exercising it) were updated in the same change, verified
  with `tsc --noEmit`.

## Future implications

A future weighted-capacity or specialist-reviewer requirement
(mentioned as a possible extension in §6) is additive to
`selectLeastLoadedReviewers` — one more sort key or filter step, not a
rewrite — since `ReviewerWorkload` already carries
`maxConcurrentAssignments` as a first-class field. A third
status-lifecycle entity (Interview scheduling, in Phase 4A) is the
natural point to revisit whether a shared state-machine abstraction has
become worth it.
