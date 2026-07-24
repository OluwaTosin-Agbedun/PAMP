# Blind Review Enforcement

§2/§8 of the Phase 3B brief: "Reviewers must not see each other's scores
or comments until the review cycle is complete," and blind-review
controls must be "server-side only" — never something that relies on the
client not asking for data it shouldn't see.

## What "blind" means in this codebase

Two reviewers (`FIRST`/`SECOND`) are independently assigned to the same
`Application`. Neither's `Review` row (scores, comments, total) is
visible to the other while both are still working — and, per the current
V1.0 design, a `THIRD` reviewer resolving a divergence isn't shown that
they're doing so (see [`docs/THIRD_REVIEW_ENGINE.md`](THIRD_REVIEW_ENGINE.md)).
"Until the review cycle is complete" is not separately enforced as a
*time-based* unlock in V1.0 — there is no reviewer-facing screen yet
(Phase 3C, out of scope this phase) that would show another reviewer's
scores even after completion. The enforcement described here is the
*data-access* layer that any such screen will sit behind.

## How it's enforced

**Every query that returns Review or ReviewAssignment rows for "a
reviewer" is scoped by `reviewerId` in the database `WHERE` clause
itself — never by filtering a broader result set in application code
after the fact.** A filter-after-fetch approach is one missed `if` away
from a leak; a `WHERE reviewerId = :actorId` clause cannot return a row
that doesn't match, regardless of what the caller does with the result.

Two concrete implementations of this, both already in the codebase:

1. **Review ownership** (`modules/reviews/services/reviewService.ts`,
   built in Phase 3A) — `createReview`, `saveDraftScores`, `submitReview`,
   `removeDraftScore` all call `assertOwnership(review, actorId)`, which
   throws `AuthorisationError` if `review.reviewerId !== actorId`.
   `getReviewScoreBreakdownForActor` is the one function that allows a
   non-owner to read a review, and only after an explicit
   `review_scores.view` permission check — the deliberate, audited
   exception for administrative/oversight roles, not a blind-review
   violation (an oversight role seeing scores is expected; a *peer
   reviewer* seeing them is not, and no peer-reviewer role has
   `review_scores.view`; see the role matrix in
   [`docs/RBAC.md`](RBAC.md#role--permission-matrix)).

2. **Assignment visibility** (`modules/reviews/repositories/
   assignmentRepository.ts`'s `listActiveAssignmentsForReviewer`,
   Phase 3B) — `WHERE reviewerId = :reviewerId` is baked into the query,
   not applied afterward. `assignmentService.listMyAssignments(actorId)`
   is the one function that exposes assignment rows to a reviewer, and it
   takes no `reviewerId` parameter at all — it always uses the
   authenticated actor's own ID, so there is no argument a caller could
   pass to see someone else's assignments. This is the function a future
   Reviewer Workspace (Phase 3C) calls for "my assignments."

Everything else in `assignmentRepository.ts` that returns *multiple*
reviewers' assignments for one application (`listActiveAssignmentsForApplication`,
used internally by the escalation engine and by
`assignmentService`'s administrative functions) is never called with a
reviewer's own session — only from system-triggered code
(`checkAndHandleEscalation`) or behind an explicit `assignments.view`/
`assignments.reassign`/`assignments.cancel` permission check for
oversight roles. A Reviewer role has none of those permissions (see the
role matrix).

## What a Programme Secretary/Director *can* see, and why that's not a leak

`assignments.view` (granted to `PROGRAMME_SECRETARY`, `PROGRAMME_DIRECTOR`,
`SYSTEM_ADMIN`) exposes *assignment metadata* — who is assigned, what
status, workload counts — through `getAssignmentAnalytics` and the
listing functions. It does not expose `Review.totalScore` or
`Review.comments`; those stay behind `review_scores.view`, a separate
permission not granted to `PROGRAMME_SECRETARY`. Knowing *that* two
reviewers are assigned isn't the thing blind review protects against —
knowing *what they scored* is, and that boundary is exactly where the
permission split falls.

## Third-review blindness

See [`docs/THIRD_REVIEW_ENGINE.md`](THIRD_REVIEW_ENGINE.md#blindness) —
a `THIRD` assignment is created and reviewed through the exact same
`createReview`/`submitReview` path as any other assignment; nothing
about it is flagged as "resolving a disagreement" anywhere the third
reviewer can see it.

## Testing

`tests/integration/reviewAssignmentEngine.test.ts`'s
`listMyAssignments returns only the calling reviewer's own active
assignments` test creates two reviewers on the same application and
confirms each one's query returns exactly their own row. Phase 3A's
`tests/integration/reviewLifecycle.test.ts`'s `rejects a reviewer
creating a review for someone else's assignment` test covers the
review-ownership half.
