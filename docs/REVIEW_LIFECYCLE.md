# Review Lifecycle

How a `Review` moves from creation to a locked, submitted result — and
back, under controlled conditions. See
[`docs/REVIEW_FRAMEWORK.md`](REVIEW_FRAMEWORK.md) for what it's scored
against and [`docs/SCORING_ENGINE.md`](SCORING_ENGINE.md) for how the
total is computed.

## Status graph

`ReviewStatus` (Prisma enum): `NOT_STARTED`, `IN_PROGRESS`, `SUBMITTED`,
`REOPENED`, `RECUSED`, `CANCELLED`.

```
NOT_STARTED ──▶ IN_PROGRESS ──▶ SUBMITTED ──▶ REOPENED ──▶ SUBMITTED
     │               │                                        │
     └──────────────▶ SUBMITTED (direct, see below)            └──▶ CANCELLED
     │               │
     └──▶ RECUSED    └──▶ RECUSED
     │               │
     └──▶ CANCELLED  └──▶ CANCELLED
```

`modules/reviews/domain/lifecycle.ts`'s `REVIEW_TRANSITIONS` is the
*only* place this graph is defined — every service that changes
`Review.status` calls `assertTransition(from, to)` first, so "no
arbitrary status changes" (§11) is one rule to audit, not one per call
site. `RECUSED` and `CANCELLED` are terminal: no transitions out of
either.

### Why NOT_STARTED → SUBMITTED is allowed directly

An early version of this graph required passing through `IN_PROGRESS`
first. That's wrong: a reviewer who fills in every score and hits
"Submit" without ever separately saving a draft is a completely normal
flow, not an error condition — nothing in §11/§12 requires an
intermediate draft state. `tests/integration/reviewLifecycle.test.ts`'s
"submits a complete review" test caught this directly (it called
`submitReview` on a freshly-created, never-drafted review and got
`InvalidReviewTransitionError` before the fix) — found by an integration
test, not by typecheck or a unit test in isolation, since the unit tests
for `assertTransition` only check the transition table against itself,
not against how `submitReview` actually calls it.

### REOPENED carries the same edit rights as IN_PROGRESS

Both allow draft score saves. They're kept as distinct enum values so a
"reopened, not yet resubmitted" review is visibly different in the data
from one that was simply always in progress — useful for a future
"reviews awaiting resubmission" report, not required by any calculation
or validation rule.

## Draft vs. submission (§12)

`modules/reviews/domain/validation.ts`'s `validateReviewScores` takes a
`mode: "draft" | "submit"` and enforces different rules per mode:

| Check | Draft | Submit |
|---|---|---|
| Score within `[minScore, maxScore]` | ✅ rejected if violated | ✅ rejected if violated |
| Decimal score on a whole-number-only criterion | ✅ rejected | ✅ rejected |
| Score doesn't match its rating scale's bands | ✅ rejected | ✅ rejected |
| Duplicate criterion in one call | ✅ rejected | ✅ rejected |
| Criterion not in this review's framework | ✅ rejected | ✅ rejected |
| Criterion is inactive | ✅ rejected | ✅ rejected |
| Missing score for a mandatory criterion | allowed | ✅ rejected (`MISSING_MANDATORY_SCORE`) |
| Missing comment on a comment-mandatory criterion | allowed | ✅ rejected (`COMMENT_REQUIRED`) |
| Missing overall comment when the stage requires one | allowed | ✅ rejected (`OVERALL_COMMENT_REQUIRED`) |

In other words: **a draft may be incomplete, never wrong.** Range,
decimal-policy, and rating-scale violations are rejected in both modes
— an out-of-range score is never valid, draft or not.

`saveDraftScores` treats `input.scores` as an incremental upsert (each
entry is `INSERT ... ON CONFLICT UPDATE` against the
`(reviewId, criterionId)` unique constraint) — a partial draft save only
touches the criteria included in that call, leaving previously-saved
scores for other criteria untouched. `submitReview` is different:
`input.scores` there is treated as the **complete, authoritative set**
at the moment of submission — the client is expected to send the full
current form state, not a delta, since submission-completeness
validation checks the submitted set directly rather than merging it
with whatever was saved in earlier draft calls. This avoids ambiguity
about what "the current state" means at the one moment it has to be
exactly right.

### Submission checklist (§12)

`submitReview` (`modules/reviews/services/reviewService.ts`), in order:

1. Ownership: `review.reviewerId === actorId`, else `AuthorisationError`.
2. `review.status` isn't already `SUBMITTED` (`ReviewAlreadySubmittedError`) and the transition to `SUBMITTED` is valid (`assertTransition`).
3. The framework is `PUBLISHED` (`FrameworkNotPublishedError` — defensive; shouldn't happen since a review is only ever created against a published framework).
4. The stage's `[opensAt, closesAt]` window (if set) contains "now" (`ReviewPeriodClosedError`). **No administrative override mechanism exists yet** — see "known limitations" in [`docs/PHASE_3A_IMPLEMENTATION_REPORT.md`](PHASE_3A_IMPLEMENTATION_REPORT.md).
5. `application.eligibilityStatus === "ELIGIBLE"` (`ValidationError` otherwise — reused rather than a dedicated error class; this is a straightforward rejection, not a distinct architectural concept).
6. `validateReviewScores(..., mode: "submit")` passes — every mandatory criterion scored, every required comment present, no invalid score.
7. Compute the total (`calculateReviewTotal`) from exactly the submitted scores.
8. **Transactionally**: upsert every score row, then a status-conditioned update (`WHERE id = reviewId AND status = <the status read at the start>`) flips the review to `SUBMITTED` with the computed total, comments, and `submittedAt`. If that conditional update matches zero rows — because another request already changed the status between this request's read and its write — the whole transaction is abandoned and `ReviewConcurrencyError` is thrown. Either every score row is written and the review submits, or nothing changes (§12's "either the complete submission succeeds or no submission state is changed").
9. Write a `REVIEW_SUBMITTED` audit entry (existing action, reused from Sequence 1) with the total and framework version.

## Locking and immutability (§13)

Once `SUBMITTED`, nothing in this codebase provides a path to directly
edit `ReviewScore` rows, `Review.comments`, or `Review.totalScore` —
`saveDraftScores`/`removeDraftScore` both check `status !== "SUBMITTED"`
first and throw `ReviewAlreadySubmittedError`. The framework version
used stays identifiable forever via `Review.reviewFrameworkId`, which
points at one specific, never-mutated `ReviewFramework` row (see
[`docs/REVIEW_FRAMEWORK.md`](REVIEW_FRAMEWORK.md) on publish
immutability) — even after a newer framework version is published and
the one this review used is retired,
`tests/integration/reviewDataIntegrity.test.ts` confirms the pointer and
the underlying criteria are both still exactly what they were.

## Reopening (§13)

`reopenReview(actorId, { reviewId, reason })` —
`review_scores.reopen` permission (System Administrator only, per §16),
`SUBMITTED → REOPENED` via `assertTransition`, status-conditioned update
for the same concurrency-safety reason as submission.

**Historical reconstruction without a second copy of the scores.**
Before flipping status, the current `ReviewScore` rows and the
soon-to-be-overwritten `totalScore`/`submittedAt` are read and written
into the `REVIEW_REOPENED` audit entry's `metadata` —
`{ reason, priorStatus, priorTotal, priorSubmittedAt, priorScores: [...] }`.
This is a deliberate choice over adding a parallel
`ReviewScoreHistory`-style table: the audit trail is already this
project's single history mechanism (see
[`docs/database.md`](database.md#8-audit-strategy)), and one audit row
per reopen is enough to answer "what did this look like before it was
reopened" without a second schema surface to keep in sync. The prior
`submittedAt` is *not* cleared on reopen — it's overwritten only when
the review is resubmitted, so "when was this last actually submitted"
stays accurate at every point in between.

## Recalculation

`recalculateReview(actorId, reviewId)` — same permission as reopening
(an administrative correction action, not a reviewer self-service one).
Recomputes the total from the current `ReviewScore` rows and overwrites
`Review.totalScore` **only if it differs** from what's stored, writing a
`REVIEW_RECALCULATED` audit entry with `{ from, to }` only on an actual
change — routine recalculation-after-reopen (where nothing drifted)
doesn't create audit noise.
`tests/integration/reviewDataIntegrity.test.ts` verifies both halves: no
audit row when nothing changed, and a correct `from`/`to` pair when a
directly-corrupted total (bypassing the service, simulating drift) gets
fixed.

## Concurrency and data integrity (§18)

| Risk | Control |
|---|---|
| Double submission (two tabs, or a retried request) | Status-conditioned `updateMany` inside the submission transaction — the second writer's `WHERE status = <expected>` matches zero rows and throws `ReviewConcurrencyError`, never double-processing. `tests/integration/reviewLifecycle.test.ts`'s concurrent-`Promise.allSettled` test confirms exactly one of two simultaneous submissions succeeds, one `REVIEW_SUBMITTED` audit row exists, and the final total is consistent. |
| Duplicate criterion score for one review | Both layers: `validateReviewScores` rejects a duplicate `criterionId` within one call, *and* the database's `@@unique([reviewId, criterionId])` constraint on `ReviewScore` rejects it at the storage layer regardless of what application code does — `tests/integration/reviewDataIntegrity.test.ts` inserts a second row directly via Prisma (bypassing the service entirely) and confirms Postgres itself refuses it. |
| Framework modified while a review is in progress | Can't happen by construction — a framework is immutable once `PUBLISHED` (see [`docs/REVIEW_FRAMEWORK.md`](REVIEW_FRAMEWORK.md)), and a review is only ever created against a `PUBLISHED` framework. There's no "framework being edited under an in-progress review" state to protect against. |
| Stale draft writes | Not specially guarded — the last write for a given `(reviewId, criterionId)` wins, matching ordinary form-autosave semantics. Full optimistic-concurrency protection (an `updatedAt`/version check on every draft save) was judged unnecessary complexity for a *draft* — the case that actually matters, submission, has the transactional/status-conditioned protection above. |
| Score recalculation racing submission | Both go through the same `Review` row; `recalculateReview` doesn't have a status precondition of its own, but in practice only runs as an administrative action after a reopen, not concurrently with an in-flight submission — flagged as a known limitation, not a proven-safe interleaving, in [`docs/PHASE_3A_IMPLEMENTATION_REPORT.md`](PHASE_3A_IMPLEMENTATION_REPORT.md). |

No extra `version` column was added to `Review` for optimistic
concurrency — `status` itself is the guard, since every status-changing
operation already has a well-defined expected "from" state (see the
status graph above). This is the "status conditions in update queries"
option §18 lists, not a hand-rolled version field.
