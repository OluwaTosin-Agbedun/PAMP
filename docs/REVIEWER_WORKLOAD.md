# Reviewer Workload Balancing

§6 of the Phase 3B brief. `modules/reviews/domain/workloadBalancing.ts` —
pure, no I/O; the service layer loads a snapshot and hands it in.

## The algorithm

1. **Filter out anyone at or over capacity.** `isAtCapacity(candidate)`
   is `activeAssignmentCount >= maxConcurrentAssignments`. A candidate at
   capacity is never selected, full stop — not deprioritized, excluded.
2. **Random shuffle, then a stable sort by ascending active-assignment
   count.** The shuffle is the tie-break for candidates with equal load;
   the sort is what actually enforces "distribute as evenly as
   possible."
3. **Take the first `count` candidates.**

```ts
function selectLeastLoadedReviewers(candidates: ReviewerWorkload[], count: number) {
  const withCapacity = candidates.filter((c) => !isAtCapacity(c));
  const shuffled = [...withCapacity].sort(() => Math.random() - 0.5);
  const byLoad = shuffled.sort((a, b) => a.activeAssignmentCount - b.activeAssignmentCount);
  return { selected: byLoad.slice(0, count).map((c) => c.reviewerId), remaining: byLoad.slice(count).map((c) => c.reviewerId) };
}
```

If fewer than `count` candidates survive the capacity filter, the
function itself doesn't throw — it just returns fewer than requested.
The caller (`assignmentService.selectReviewers`) is what decides that's
fatal, throwing `NoEligibleReviewersError` when `selected.length < count`.
Keeping the pure algorithm exception-free and pushing the "is this
acceptable" decision to the caller is what let `autoAssignReviewers`
treat a shortfall as a silent skip while `assignThirdReviewer` treats the
identical shortfall as something the escalation-handling code explicitly
catches and reacts to (see
[`docs/THIRD_REVIEW_ENGINE.md`](THIRD_REVIEW_ENGINE.md#selecting-the-third-reviewer)).

## Why random-then-sort, not round-robin

The brief permits either "random or round-robin... while maintaining
deterministic auditability." Sequence 1's original `autoAssignReviewers`
already used this exact two-step shuffle-then-sort for its balancing
(this phase reuses that behavior, not a competing algorithm — see
ADR-0007). "Deterministic auditability" is satisfied by *recording* the
decision, not by making the selection itself reproducible: every
assignment writes a `REVIEW_ASSIGNED`/`REVIEW_THIRD_REVIEWER_ASSIGNED`
audit entry naming exactly who was picked, so any assignment is
traceable after the fact even though re-running the same inputs wouldn't
necessarily reproduce the same pick among equally-loaded candidates.

## Where "load" comes from

`activeAssignmentCount` is computed live —
`assignmentRepository.countActiveAssignmentsForReviewers` groups active
`ReviewAssignment` rows (`PENDING`, `ASSIGNED`, `ACCEPTED`,
`IN_PROGRESS`, `SUBMITTED`, `ESCALATED` — everything except the
terminal `REASSIGNED`/`CANCELLED`/`COMPLETED`) by reviewer. There is no
separately-maintained counter to keep in sync; a cancelled or reassigned
assignment immediately stops counting toward that reviewer's load on the
very next selection, with no batch job or cache invalidation involved.

## Capacity: per-programme, with a configurable default

`ReviewerCapacity` (`reviewerId`, `programmeId`) →
`maxConcurrentAssignments` (default 10, via the configurable
`review.reviewer_default_max_concurrent_assignments` setting when no row
exists — see [`lib/settings/service.ts`](../lib/settings/service.ts)),
`isAvailable`, `unavailableReason`, `unavailableUntil`. A reviewer with
no `ReviewerCapacity` row at all is treated as available with the
default max — a fresh reviewer account is immediately eligible without
requiring an administrator to first create a capacity row for them.

`unavailableUntil` is stored but not automatically enforced as an
expiry — `isAvailable` is the actual switch a Programme Secretary flips
(via `setReviewerCapacity`). `unavailableUntil` is descriptive metadata
for "when did they say they'd be back," not a scheduled auto-reactivation;
building that would be a Phase 3D-or-later concern (§18 excludes calendar
integration entirely from this phase).

## Future: weighted capacity / specialist reviewers

`ReviewerWorkload` already carries `maxConcurrentAssignments` as a
first-class field, and the sort key is a simple ascending comparison —
adding a weight (e.g. sorting by `activeAssignmentCount / weight` instead
of raw count) or a specialism filter (excluding non-specialist
candidates before the balancing step, the same way conflicted candidates
are already excluded) is additive to this shape, not a rewrite of it.

## Testing

`tests/unit/workloadBalancing.test.ts` covers the pure algorithm in
isolation: capacity exclusion, load-ordering, graceful under-fulfillment,
and tie-break distribution across repeated draws.
`tests/integration/reviewAssignmentEngine.test.ts`'s auto-assignment
tests confirm the end-to-end behavior against real Postgres data,
including capacity enforcement pulled from an actual `ReviewerCapacity`
row.
