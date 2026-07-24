# Reviewer Workspace

Phase 3C. The first UI built against Phase 3A's scoring engine and Phase
3B's assignment engine — an Application Reviewer's own view of their
assigned queue and a scoring form for each assignment. No interview
functionality ships this phase (§3 of the brief).

## Routes

| Route | Permission | Purpose |
|---|---|---|
| `/reviews` | `reviews.view` | Assigned queue — every active assignment for the signed-in reviewer, with a status badge per assignment. |
| `/reviews/[assignmentId]` | `reviews.perform` | Scoring form (if the review isn't yet submitted) or a read-only summary (if it is). |

`/reviews`'s permission (`reviews.view`) is broader than
`/reviews/[assignmentId]`'s (`reviews.perform`) deliberately — it's the
same "global read, never act" pattern already used for Executive
Approval/Committee visibility elsewhere in this codebase. An oversight
role (Programme Director, Programme Secretary) with `reviews.view` but
not `reviews.perform` can open `/reviews` and correctly sees an empty
queue (they have no assignments); nothing on that page requires
`reviews.perform` to render safely. Only the scoring page itself, where
there's something to *do*, requires the stricter permission — matching
`reviewService.createReview`'s own permission check exactly, so a
redirect happens before the page ever tries an action the underlying
service would reject anyway.

## Data flow

- **List page** (`app/(dashboard)/reviews/page.tsx`) reads through
  `assignmentService.listMyAssignments(actorId)` — the exact function
  `docs/BLIND_REVIEW.md` named, in Phase 3B, as "the one function a
  future Reviewer Workspace calls for 'my assignments.'" Its underlying
  repository query (`assignmentRepository.listActiveAssignmentsForReviewer`)
  gained a richer include this phase (applicant name/email, the linked
  review's status/total) — additive to its original shape, still scoped
  by `reviewerId` in the `WHERE` clause itself, still the one function
  this seam promised.
- **Scoring page** (`app/(dashboard)/reviews/[assignmentId]/page.tsx`)
  calls `reviewService.createReview(actorId, assignmentId)` — idempotent
  (Phase 3A): creates the `Review` row on first visit, returns the
  existing one on every visit after. Ownership is enforced inside
  `createReview` itself (`assignment.reviewerId !== actorId` throws
  `AuthorisationError`), not re-implemented in the page — the page just
  maps that error to `notFound()` rather than leaking whether the
  assignment ID exists at all.
- **No published framework yet** (`FrameworkNotPublishedError`) renders
  a friendly card, not an error page — a real, expected state in this
  codebase today (see `docs/PHASE_3A_IMPLEMENTATION_REPORT.md` §14/§20:
  no PAM-P criteria were ever seeded, since no source document for them
  exists), not a bug to crash on.
- **Mutations** (`app/(dashboard)/reviews/[assignmentId]/actions.ts`) —
  `saveDraftScoresAction`/`submitReviewAction` — call straight through to
  `reviewService.saveDraftScores`/`submitReview`, which already validate,
  transact, and audit (Phase 3A). The Server Actions themselves are thin:
  `requireSession()` for a cheap auth floor, Zod-parse the input, call the
  service, translate any thrown `AppError` via `handleActionError` into
  an inline `{ error }` rather than a redirect — this is a form the user
  is actively working in; a permission or validation failure should
  surface next to the field, not navigate them away from their draft.

## Autosave

A criterion's score or comment change schedules a debounced
(1.2s) call to `saveDraftScoresAction` with every currently-filled-in
criterion — not just the one that changed, since `saveDraftScores`
already treats its input as "the criteria included in this call," and
resending the full current set is simpler and still correct (each
criterion upserts independently; nothing is lost or duplicated by
resending an unchanged value). An `aria-live="polite"` status region
("Saving…" / "Draft saved" / an inline error) reports the outcome
without moving focus or interrupting the reviewer's typing.

**Clearing a score isn't wired to autosave.** `saveDraftScores` never
deletes a criterion's row — leaving a score field empty and letting
autosave fire just means that criterion isn't in the payload, and its
last-saved value stays exactly as it was (matching
`docs/REVIEW_LIFECYCLE.md`'s documented "a partial draft save only
touches the criteria included in that call" semantics exactly).
`reviewService.removeDraftScore` exists for an explicit clear action, but
this phase doesn't wire a UI control to it — a reviewer who wants to
genuinely blank a score types over the field with a new value instead of
needing a separate delete action. Flagged as a possible follow-up if
real reviewer usage shows this is needed, not built speculatively.

## Submission and locking

Submitting calls `submitReviewAction` with the full current scores plus
the overall comment. On success, the client calls `router.refresh()` —
the page re-fetches server-side, `review.status` is now `SUBMITTED`, and
`page.tsx` renders `ReviewSummary` (read-only) instead of `ScoringForm`
on the next render, per §13's locking rule (Phase 3A: nothing provides a
path to edit a submitted review). On failure (e.g.
`IncompleteReviewError` for a missing mandatory score), the message is
shown inline and as a toast — the form state is untouched, so the
reviewer doesn't lose anything they'd already typed.

## Serialization boundary

Every `Prisma.Decimal` value (`minScore`, `maxScore`, `weight`, rating
scale band `value`, a score's `rawScore`, the running `total`) is
converted to a plain string in the Server Component
(`app/(dashboard)/reviews/[assignmentId]/page.tsx`) before being passed
to the Client Components (`ScoringForm`/`ReviewSummary`) — a `Decimal` is
a class instance, and Next's Server → Client serialization only accepts
plain JSON-safe values. `app/(dashboard)/reviews/[assignmentId]/types.ts`
defines the plain view-model shapes (`CriterionViewModel`,
`ScoreViewModel`) this boundary produces. See
[ADR-0010](adr/ADR-0010-reviewer-workspace-autosave-and-serialization.md).

## New UI primitives

`components/ui/{textarea,progress}.tsx` — two components this codebase
didn't have yet. `Textarea` mirrors the existing `Input` component's
style exactly. `Progress` is hand-rolled (a labelled `div` with
`role="progressbar"`, no Radix primitive) rather than adding
`@radix-ui/react-progress` as a new dependency for one progress bar —
every other Radix-based primitive in this codebase (`Dialog`, `Select`,
`Switch`, etc.) wraps a primitive that was *already* a dependency before
this phase; this is the first one that would have needed a net-new
package.

## Accessibility and responsiveness

Each criterion is a `<fieldset>`/`<legend>` pair; a rating-scale
criterion renders as a labelled `radiogroup` of bands rather than a bare
numeric input, so the scale's meaning (not just its number) is what a
screen reader announces. Every input has an explicit `<Label
htmlFor>`; guidance text is linked via `aria-describedby`; required
fields carry `aria-required` matching the exact same
`allCriteriaMandatory || criterion.isMandatory` rule
`validateReviewScores` enforces server-side (§12) — the UI's "required"
marking and the server's actual requirement can never drift apart,
because both read the same stage/criterion flags, not a duplicated
constant. The layout is a single-column vertical stack at every
viewport width — no new breakpoint logic was needed;
`components/layout/{sidebar-nav,mobile-nav}.tsx` (navy/gold, collapsible,
mobile drawer) were untouched by this phase, since the Reviewer
Workspace is ordinary dashboard content within that existing shell.

## Testing

`tests/integration/reviewsWorkspaceActions.test.ts` (6 tests) covers the
two Server Actions: input validation, ownership enforcement (a reviewer
cannot save/submit against another reviewer's review — not just a
permission-list check, an actual attempted mutation that's rejected),
successful partial-draft save, successful submission with correct total,
and inline (non-thrown) error reporting for an incomplete submission.

**Manual browser verification** (`npx playwright`, against a real
Postgres-backed dev server, headless Chromium, cleaned up afterward —
see the Phase 3C implementation report for the exact scenario): login →
sidebar shows "Application Review" → list page shows both assigned
applicants with correct status → an assignment with no published
framework shows the friendly empty state, not a crash → an assignment
with a published framework renders both criteria correctly → filling in
scores triggers the autosave indicator → submitting shows the correct
computed total, flips the page to the locked read-only summary, and the
list page's status counts update → the same list page renders correctly
at a 390px mobile viewport with the hamburger nav trigger present.
