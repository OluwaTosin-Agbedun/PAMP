# Consolidated Implementation Report — Phases 3B.1, 3C, 3D

Covers three phases built in one continuous session: role/permission/
navigation reconciliation (3B.1), the Reviewer Workspace (3C), and the
Programme Secretariat Review Operations Workspace (3D).

## 1. Commits created

| Commit | Phase | Summary |
|---|---|---|
| `c42b167` | 3B.1 | Role vocabulary, permission, and navigation reconciliation |
| `c302a25` | 3C | Reviewer Workspace — assigned queue and scoring form |
| *(pending, this report)* | 3D | Programme Secretariat Review Operations Workspace |

Each phase was verified in full (schema validation, migration status,
typecheck, lint, unit/integration tests, and for 3C/3D a manual or
automated browser check) before being committed, per this session's
gated-phase discipline.

## 2. Schema changes

| Phase | Schema change |
|---|---|
| 3B.1 | `Role` enum: `REVIEWER` removed, replaced by `ELIGIBILITY_REVIEWER` and `APPLICATION_REVIEWER` (net: 8 values → 9 values). |
| 3C | None. |
| 3D | None. |

3C and 3D deliberately built on tables already created by Phase 3A/3B/
the original database design (`Review`, `ReviewAssignment`,
`ReviewConflictOfInterest`, `ReviewEscalation`, `ReviewerCapacity`,
`Note`) — 3D specifically reuses the pre-existing, previously-unused
`Note`/`NoteVisibility` model for Administrative Notes rather than
adding a new table.

## 3. Migrations

One migration this window:
`prisma/migrations/20260719160000_phase3b1_role_split/migration.sql`
(Phase 3B.1). Postgres has no `ALTER TYPE ... DROP VALUE`, so removing
`REVIEWER` required creating a replacement enum type, migrating the one
column that uses it (`users.role`) with a `CASE` expression backfilling
every existing `'REVIEWER'` row to `'APPLICATION_REVIEWER'`, dropping
the old type, and renaming the new one into place — all in one
statement, applied and verified against the real dev database. All
three real `REVIEWER` accounts
(`reviewer.one@pam-p.org`, `reviewer.two@pam-p.org`,
`chinaza.igwe@pam-p.org`) were confirmed correctly backfilled; no
account was deleted, no field besides `role` changed.
`npx prisma migrate status` confirms 8 migrations total, database up to
date, no drift, as of the end of Phase 3D.

## 4. Role and navigation reconciliation (Phase 3B.1)

Reconciled the codebase's role vocabulary and navigation taxonomy
against the brief's approved 9-role, 12-item-navigation PAM-P
operational model:

- **`REVIEWER` split** into `ELIGIBILITY_REVIEWER` (read-only oversight
  — eligibility screening remains fully automatic, so there is no human
  eligibility action to gate) and `APPLICATION_REVIEWER` (the former
  `REVIEWER` role's exact capability set, renamed not reduced).
- **Navigation restructured** from 6 groups to 11 (per taxonomy items
  2–12; Dashboard, item 1, was already its own pinned entry) —
  Applicant Import and Notifications gained their own top-level slots
  (Notifications built as a permission-gated placeholder,
  `implemented: false`, since no delivery module exists yet); Eligibility
  Screening and Audit Trail were promoted out of "Administration" into
  their own slots.
- **Observer role**: confirmed absent from the codebase already — no
  reconciliation action needed.
- **One open governance question, flagged not guessed**: whether
  `Eligibility Reviewer` is intended to eventually perform a human
  review/override action on automatic eligibility decisions, or is
  permanently read-only oversight. This phase implemented the latter —
  the minimal, evidence-supported interpretation — and explicitly
  flagged the alternative as a future-phase decision requiring
  programme-owner confirmation, per the brief's own "stop if any
  unresolved role mapping requires programme-owner confirmation"
  instruction. See [ADR-0009](adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md)
  and `docs/ROLE_AND_NAVIGATION_RECONCILIATION.md` for the full
  discrepancy matrix and reasoning.

81 mechanical `Role.REVIEWER` → `Role.APPLICATION_REVIEWER` renames were
applied across `modules/`, `tests/`, `lib/`; 8 new tests
(`tests/integration/roleReconciliation.test.ts`) specifically assert the
new role vocabulary's boundaries (e.g., an Eligibility Reviewer cannot
perform an application review via a real `createReview` call, not just a
permission-list check).

## 5. Reviewer Workspace (Phase 3C)

The first UI in this codebase for an `APPLICATION_REVIEWER` to see their
assigned queue (`/reviews`) and score an application
(`/reviews/[assignmentId]`) — built entirely against Phase 3A's scoring
engine and Phase 3B's assignment engine, no new domain logic, no schema
change, no new permission. Debounced (1.2s) autosave resending the full
current draft each tick; a progress bar; rating-scale criteria rendered
as accessible radio groups; a read-only locked summary once submitted.
`Prisma.Decimal` values are converted to plain strings in the Server
Component before crossing to Client Components (`Decimal` instances
can't serialize across that boundary directly). No interview
functionality shipped, per the brief's scope boundary. See
`docs/REVIEWER_WORKSPACE.md` and
[ADR-0010](adr/ADR-0010-reviewer-workspace-autosave-and-serialization.md).

## 6. Secretariat Workspace (Phase 3D)

Gives the Programme Secretariat (and Director/Admin) operational
visibility and limited control over the application-review stage: a
metrics dashboard, a filterable/paginated assignment monitoring table, a
per-application detail screen with side-by-side reviewer scores/
comments and a reassignment dialog, a reviewer workload view, third-
review monitoring (reading Phase 3B's stored escalation data verbatim,
never recalculating), a conflicts/recusals queue, administrative notes,
a full audit trail, and a permission-gated, data-minimised CSV export.
Every mutation delegates to Phase 3B's already-tested assignment engine
— this phase added no new score-mutation path, no reviewer-
impersonation path, and no framework-editing path. No Interview,
Committee, Executive Approval, Admissions, or notification
functionality shipped, per the brief's scope boundary. See
`docs/PROGRAMME_SECRETARIAT_WORKSPACE.md`,
`docs/REVIEW_OPERATIONS.md`, `docs/REVIEW_REASSIGNMENT.md`,
`docs/REVIEW_MONITORING_AND_ESCALATION.md`,
`docs/PHASE_3D_IMPLEMENTATION_REPORT.md`,
[ADR-0011](adr/ADR-0011-review-operations-read-model.md), and
[ADR-0012](adr/ADR-0012-operational-export-controls.md).

## 7. Test results

| Phase | Unit/integration | End-to-end |
|---|---|---|
| 3B.1 | 8 new tests (`roleReconciliation.test.ts`), 81 mechanical renames across existing suites | — |
| 3C | 6 new tests (`reviewsWorkspaceActions.test.ts`) | Manual Playwright-script browser verification (not committed as a suite) |
| 3D | 12 new tests (`reviewOperations.test.ts`) | 5 tests × 2 projects = 10 (`reviewOperations.spec.ts`, `desktop-chromium` + `mobile-chromium`) |

**Current full suite: `npx vitest run` — 260/260 passing across 23
files.** `npx playwright test` — 10/10 passing. No regression across
any of the three phases; each phase's own test run was verified green
before the next phase began.

Two genuine product defects were found and fixed via testing during
Phase 3D (not test-authoring mistakes): an "active assignment" status
filter that excluded `COMPLETED` caused fully-submitted, non-diverging
applications to disappear from both the dashboard's "applications
assigned" count and the Assignment Monitoring table; the same narrow-
filter pattern independently caused the application detail page to show
"No active assignment" for such applications. Both fixed by widening
the relevant status filter to include `COMPLETED` specifically for
"is this application assigned at all" queries, while keeping the
narrower filter for load/utilisation/completion-percentage math where
excluding `COMPLETED` is correct. See ADR-0011.

Two Playwright-specific test-authoring issues were also found and fixed
during 3D: a locator ambiguity between two same-labelled form fields on
one page (fixed by scoping to the open dialog), and two assertions that
read page content immediately after navigation without an explicit
wait for a stable element (fixed with Playwright's auto-retrying
`expect(...).toBeVisible()`, per its own best-practice guidance).

## 8. Build results

- `npx prisma validate` — clean.
- `npx prisma migrate status` — up to date, 8 migrations, no drift.
- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npm run build` (`next build`) — compiles, typechecks, and generates
  every route (including all seven new `/review-operations*` routes and
  the two new `/reviews*` routes) successfully.

## 9. Security findings

- **Permission checks are server-side and re-verified at the service
  layer**, never trusted from page-level gating or client state alone —
  confirmed for every new route and mutation across all three phases by
  tests that perform the actual denied action (not just assert a
  permission list), and, for 3D, additionally confirmed via a real
  browser hitting a protected URL directly.
- **Blind-review boundary held**: no query added in 3C or 3D lets a
  reviewer see another reviewer's work; the one place two reviewers'
  scores/comments are shown together (3D's application detail page) is
  gated by a permission (`review_operations.view`) no
  `APPLICATION_REVIEWER` holds — verified by both an integration test
  and a Playwright direct-URL-access test.
- **No new score-mutation surface**: nothing added in 3D writes to
  `Review.totalScore`/`ReviewScore` — every score-affecting action
  remains exclusively a reviewer's own Phase 3A `saveDraftScores`/
  `submitReview` call.
- **Export data-minimisation**: the Phase 3D CSV export deliberately
  excludes email addresses and individual reviewer scores/comments,
  narrower than what the same authenticated role can see on screen —
  reasoned in ADR-0012 as appropriate given a downloaded file's
  materially different (and system-invisible) distribution risk once it
  leaves the browser.
- **Every mutation is audited**, including the new export action itself
  (`REVIEW_OPERATIONS_EXPORTED`, recording `rowCount`) — an export
  cannot happen without leaving a record of who performed it and how
  many rows it contained.
- **No secrets, credentials, or session data** appear in any export
  column or any newly-added log/audit metadata field — reviewed
  directly against the export column list and the audit metadata shapes
  in `assignmentService`/`exportService`.
- No new authentication surface, no new external network call, no new
  dependency with a network-facing runtime role (`@playwright/test` is
  dev-only, never bundled into the production build — confirmed by
  `npm run build`'s route list containing no Playwright-related output).

## 10. Accessibility findings

- **3C (Reviewer Workspace)**: each scoring criterion is a
  `<fieldset>`/`<legend>` pair; rating-scale criteria render as labelled
  `radiogroup`s so a screen reader announces the scale's meaning, not a
  bare number; every input has an explicit `<Label htmlFor>`; guidance
  text is linked via `aria-describedby`; `aria-required` mirrors the
  exact same mandatory-criterion rule the server enforces (no drift
  between what the UI marks required and what the server actually
  requires); autosave status is an `aria-live="polite"` region that
  reports without stealing focus.
- **3D (Secretariat Workspace)**: built from the same existing UI
  primitive set (`Card`, `Table`, `Dialog`, `Select`, `Badge`) already
  used and reviewed for accessibility in earlier phases; the reassign
  dialog uses proper `<Label>`/`role="dialog"` semantics (confirmed
  directly by the Playwright test, which locates form fields via
  `getByLabel` inside `getByRole("dialog")` — a locator strategy that
  only succeeds if the accessible name/role wiring is actually correct,
  not merely visually present).
- **Responsive/mobile**: 3D's Playwright suite runs every test under
  both a 1280×900 desktop viewport and a Pixel 7 mobile viewport
  (`playwright.config.ts`'s two projects) — all pages, including the
  data table and the reassignment dialog, render and function correctly
  at both sizes. 3C's mobile behaviour was confirmed manually (390px
  viewport, hamburger nav present) during its own verification pass, not
  by an automated mobile Playwright project (Playwright wasn't yet
  installed at that point in the session).
- No dedicated automated accessibility-audit tool (e.g. axe) was run in
  either phase; the findings above are from structural/semantic review
  and from Playwright's role/label-based locators succeeding, not from
  an axe scan. Flagged as a gap, not claimed as full WCAG conformance
  verification.

## 11. Known limitations

- **3B.1's open governance question** (§4) remains open — this
  session's own gated-phase discipline explicitly permits proceeding
  past it once flagged, per "proceed" from the user, but the
  eligibility-reviewer-scope decision itself still needs a programme-
  owner answer.
- **3D's in-memory pagination** assumes cohort sizes in the low hundreds
  (documented scale assumption, not a hidden ceiling) — see ADR-0011.
- **3D's conflicts/recusals queue** can display a recusal but nothing in
  this codebase currently sets `Review.status = RECUSED` — the brief
  didn't authorise a Secretariat-initiated recusal action, so none was
  built.
- **3D's "due date"/"assignment batch"** are both interpretations of
  underspecified brief terms (stage-wide `closesAt`; an assigned-date
  range, respectively) rather than new schema fields — see ADR-0011.
- **3D's export is CSV, not native `.xlsx`** — satisfies
  "Excel-compatible" without adding a write use of the `xlsx`
  dependency; see ADR-0012.
- **No automated accessibility audit tool was run** (§10).
- **3C's manual browser verification was not committed as an automated
  suite** — its scenarios are now effectively superseded/covered by
  3D's Playwright infrastructure existing at all, but no dedicated 3C
  Playwright spec was retroactively written this session.

## 12. Recommended Interview Engine scope

Based on what 3B/3C/3D's architecture already provides and what the
Interview module would need to reconcile against:

- **Reuse the assignment-engine pattern, not the review-scoring
  pattern.** Interviews need their own assignment concept (interviewer ↔
  applicant, likely 1:1 rather than blind-paired), but the *shape* of
  Phase 3B's engine — eligibility filtering, capacity tracking, conflict
  exclusion, reassignment with preserved history, audit-on-every-
  mutation — is directly reusable as a template, not something to design
  from scratch.
- **A capacity/workload view analogous to 3D's Reviewer Workload
  page** will likely be needed for interviewers, once interview
  scheduling exists — the same `ReviewerCapacity`-style model (or a
  parallel `InterviewerCapacity` table) fits the existing pattern.
- **A Secretariat oversight screen analogous to 3D's Assignment
  Monitoring table** — interview scheduling status, completion, no-
  shows — is the natural Secretariat-facing counterpart, once the
  Interview Engine's own brief defines what oversight rules apply (this
  phase's Secretariat Access Rules pattern — what the Secretariat may
  view/initiate vs. must never do — should be re-specified explicitly
  for interviews, not assumed to carry over unchanged).
- **`ELIGIBILITY_REVIEWER`'s open scope question (§4)** should likely be
  resolved before or alongside Interview Engine work, since both touch
  the same "does this role get an active decision-making action or stay
  read-only oversight" question the programme owner still needs to
  answer.
- **The `Notifications` navigation slot** (Phase 3B.1, still
  `implemented: false`) is a natural companion to interview scheduling —
  an interview invitation is the first concrete use case that would
  make a real notifications/delivery module necessary, rather than
  building notification infrastructure speculatively ahead of a
  triggering feature.
- Per the brief and this session's standing instruction: **the Interview
  Engine is not started as part of this work.** This section is scope
  guidance for whoever picks up that phase next, not a plan this session
  has begun executing.
