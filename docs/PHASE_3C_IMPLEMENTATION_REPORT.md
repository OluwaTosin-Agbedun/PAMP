# Phase 3C Implementation Report — Reviewer Workspace

## 1. Executive summary

Phase 3C built the Reviewer Workspace — the first UI in this codebase
for an Application Reviewer to see their assigned queue and score an
application, entirely against the service layer Phase 3A (scoring) and
Phase 3B (assignment) already built and tested. No new domain logic, no
schema change, no new permission. No interview functionality shipped
(§3 of the brief) — this is application-review scoring only.

Two routes: `/reviews` (assigned queue) and `/reviews/[assignmentId]`
(scoring form, or a locked read-only summary once submitted). Autosave,
progress indicators, accessible form structure, and responsive layout
within the existing navy/gold dashboard shell — no shell or navigation
component changed.

## 2. Files created and modified

### Created

- **Routes**: `app/(dashboard)/reviews/page.tsx`,
  `app/(dashboard)/reviews/[assignmentId]/{page,actions,scoring-form,
  review-summary,types}.tsx`
- **UI primitives**: `components/ui/{textarea,progress}.tsx`
- **Tests**: `tests/integration/reviewsWorkspaceActions.test.ts`
- **Docs**: `docs/REVIEWER_WORKSPACE.md`, this file,
  `docs/adr/ADR-0010-reviewer-workspace-autosave-and-serialization.md`

### Modified

- `lib/navigation.ts` — the "Application Review" nav item's
  `implemented` flag flipped `false → true` (its permission,
  `reviews.view`, and taxonomy placement were already correct as of
  Phase 3B.1's navigation reconciliation — nothing else about the nav
  entry changed).
- `modules/reviews/repositories/assignmentRepository.ts` —
  `listActiveAssignmentsForReviewer`'s include gained applicant
  name/email and the linked review's status/total/submittedAt —
  additive to its original `{ id, cohortId }` shape, the one function
  the Reviewer Workspace's list page needed (per the seam
  `docs/BLIND_REVIEW.md` named in Phase 3B), not a second parallel
  query.
- `modules/reviews/repositories/reviewRepository.ts` — `REVIEW_WITH_SCORES`'s
  `application` include now nests `applicant`, so the scoring page can
  show who's being reviewed without a second query — additive to every
  existing consumer.

Nothing under `modules/reviews/{domain,services}` changed — Phase 3C is
UI and a read-query extension only, calling
`reviewService.{createReview,saveDraftScores,submitReview}` and
`assignmentService.listMyAssignments` exactly as Phase 3A/3B built them.

## 3. Design decisions

See
[ADR-0010](adr/ADR-0010-reviewer-workspace-autosave-and-serialization.md)
for the full reasoning on autosave payload shape and the Decimal
serialization boundary. Summarized:

- **Autosave** resends every currently-filled-in criterion on each
  debounced (1.2s) tick, not a diff — matches `saveDraftScores`'s
  existing "upsert what's included" semantics exactly, no new merge
  logic needed.
- **Decimal → string conversion** happens once, in the Server Component,
  producing the plain view-model types in
  `app/(dashboard)/reviews/[assignmentId]/types.ts` — `Prisma.Decimal`
  instances cannot cross the Server → Client boundary directly.
- **`Progress` is hand-rolled**, not built on a new Radix dependency —
  every other Radix-based primitive in this codebase wraps a package
  that was already a dependency; this is the first that would have
  needed a net-new one for a single progress bar.
- **No "clear a score" UI control** — `removeDraftScore` (Phase 3A)
  exists but isn't wired to a button this phase; a reviewer overwrites a
  field to change it, matching the simplest interpretation of what
  "autosave" needs to support. Flagged as a possible follow-up, not
  built speculatively ahead of a demonstrated need.

## 4. Permission model (unchanged, reused exactly)

| Route | Permission | Rationale |
|---|---|---|
| `/reviews` | `reviews.view` | Broader "global read" permission — an oversight role with this but not `reviews.perform` sees a correctly-empty queue, not an error. |
| `/reviews/[assignmentId]` | `reviews.perform` | Matches `reviewService.createReview`'s own check — a redirect happens before the page ever attempts an action the service would reject. |

No new permission was added. Ownership (a reviewer can only ever reach
*their own* assignment's scoring page) is enforced inside
`reviewService.createReview` itself, not re-implemented in the page —
`AuthorisationError`/`NotFoundError` both map to Next's `notFound()`,
so a reviewer probing another reviewer's assignment ID sees the same
404 either way, never a hint about which case it was.

## 5. Testing

`tests/integration/reviewsWorkspaceActions.test.ts` (6 tests): session
requirement (redirects to `/login`), Zod input validation, a
successful partial draft save, ownership enforcement (an actual
attempted save against another reviewer's review, rejected — not just a
permission-list assertion), a successful full submission with the
correct computed total, and an inline (not thrown) error for an
incomplete submission.

`tests/integration/roleReconciliation.test.ts`'s "navigation matches
permissions" test was updated — flipping `implemented: true` on the
Application Review nav item correctly changed `SYSTEM_ADMIN`'s visible
nav-group set, and the test now asserts the new (correct) set rather
than the old one.

**Full suite: 248 tests passing across 22 files.**

### Manual browser verification

Per this session's standing instruction to verify UI changes in a
browser before reporting completion — done via a headless-Chromium
Playwright script against a real `next dev` server backed by the actual
Postgres instance, using dedicated, cleaned-up-afterward test data (a
throwaway programme, a fresh reviewer account, two assignments — one
against a stage with no published framework, one with a
freshly-published two-criterion test framework):

1. Logged in as the test reviewer → landed on `/dashboard`.
2. Sidebar shows "Application Review" (previously hidden — `implemented`
   was `false`).
3. `/reviews` lists both assigned applicants with correct status badges.
4. The no-framework assignment shows the friendly
   "not been published yet" card, not a crash or a generic error.
5. The published-framework assignment renders both criteria (labels,
   guidance text, max scores) correctly.
6. Filling in scores and a comment triggers the autosave status
   indicator ("Draft saved").
7. Filling the overall comment and submitting: shows a success toast,
   the page flips to the locked read-only summary showing the correct
   total (15/20 for the 8+7 scores entered), the submission timestamp,
   and "this review is locked and can no longer be edited."
8. Returning to `/reviews` shows the updated status counts (1 submitted,
   1 not started).
9. At a 390px mobile viewport, `/reviews` renders correctly with the
   hamburger nav trigger present (the existing `MobileNav`/`Sheet`
   component, untouched by this phase).

All test data and the throwaway reviewer account were deleted after
verification; no scratch scripts were committed.

## 6. Verification

- `npx prisma validate` — clean (no schema change this phase).
- `npx prisma migrate status` — up to date, 8 migrations, no drift.
- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 248/248 passing, 22 files.
- `npx next build` — compiles, typechecks, and generates all routes
  (including the two new ones) successfully.

## 7. What's next

Per the roadmap, Phase 3D (Programme Secretariat Workspace: assignment
monitoring, review progress, reassignment, third-review monitoring,
statistics, admin controls) is next — it builds against the same Phase
3B assignment-engine service layer this phase's Reviewer Workspace did,
from the oversight-role side instead of the reviewer side.
