# Architecture — Phase 0, Sequence 1, Phase 2, Phase 3A, Phase 3B, Phase 3B.1 & Phase 3C

**Phase 3A** built the review framework and scoring engine — a
UI-independent domain layer (`modules/reviews/{domain,repositories,
services,validation,types,constants,seed}`) for configuring versioned
review rubrics, validating scores, and calculating totals, on top of a
restructured `ReviewStage`/`ReviewFramework`/`ReviewCriterion`/
`RatingScale` schema. No Reviewer Workspace, reviewer assignment
changes, or any other application UI shipped this phase — see
[`docs/PHASE_3A_IMPLEMENTATION_REPORT.md`](PHASE_3A_IMPLEMENTATION_REPORT.md)
for the full account, and the phase's own docs:
[`REVIEW_FRAMEWORK.md`](REVIEW_FRAMEWORK.md),
[`SCORING_ENGINE.md`](SCORING_ENGINE.md),
[`REVIEW_LIFECYCLE.md`](REVIEW_LIFECYCLE.md),
[`SCORE_CALCULATION_RULES.md`](SCORE_CALCULATION_RULES.md).

Phase 0 delivered the foundation everything else builds on: authentication,
RBAC, the database schema for staff accounts and audit logging, and the
application shell (login, dashboard, sidebar/topbar navigation). Sequence 1
(the first slice of Version 1.0) adds applicant import, the automatic
eligibility engine, automatic reviewer assignment, and Applicant
Management. Phase 2 rebuilt the authentication/RBAC/audit foundation
itself — full account-lifecycle status, a DB-verified permission service,
a typed error model, structured logging, and a forced/voluntary
password-change flow — without touching any workflow module; see
[`docs/PHASE_2_IMPLEMENTATION_REPORT.md`](PHASE_2_IMPLEMENTATION_REPORT.md)
for the full account and the deeper docs it links to
(`AUTHENTICATION.md`, `RBAC.md`, `AUDIT_LOGGING.md`,
`ENVIRONMENT_CONFIGURATION.md`, `SEEDING.md`). **The RBAC section below
describes the Phase 0/Sequence 1 design; `docs/RBAC.md` is the current,
authoritative description of the system as of Phase 2** — `lib/rbac/permissions.ts`
and `lib/rbac/actions.ts` (the module/action matrices referenced below)
were deleted this phase, replaced by `lib/permissions/{catalog,rolePermissions,service,guard}.ts`.

The complete V1.0 *database* — scoring, interviews, committee, executive
approval, admissions, ranking — was designed and migrated ahead of the
application code that uses it; see
[`docs/database.md`](database.md) for the full design (ERD, table-by-table
rationale, indexing/audit/soft-delete strategy, migration plan). The
*application modules* for those tables (Reviewer Workspace, Interview
Workspace, Committee, Executive Approval, Admissions) are still Sequence
2/3 — this document's roadmap below is unchanged by the schema work.

## Stack decisions and why

- **Next.js 16 (App Router), Turbopack.** Middleware is renamed **Proxy**
  in this version (`proxy.ts`, not `middleware.ts`) — same runtime
  semantics, new file convention. Runs on the Node.js runtime now, not Edge.
- **Prisma 7.** The default generator changed from `prisma-client-js` to
  `prisma-client`: the client is generated to a custom path
  (`lib/generated/prisma/`, gitignored, regenerated via `postinstall`) as
  ESM, and the datasource `url` can no longer live in `schema.prisma` —
  Prisma Client now takes a driver **adapter** instead. We use
  `@prisma/adapter-pg` (`lib/db/prisma.ts`), which also means the ORM talks
  to Postgres over `pg` directly rather than Prisma's older query engine
  binary — one fewer moving part in deployment.
- **Auth.js (NextAuth) v5, Credentials provider, JWT sessions.** Per the
  brief: System Administrator provisions all accounts, no self-service
  sign-up. Passwords are hashed with `bcryptjs` (pure JS — avoids native
  `bcrypt` build issues on serverless deploy targets; same algorithm).
- **RBAC is config, not code-per-role.** `lib/rbac/permissions.ts` is a
  single module→role access matrix. Adding a module is one array entry;
  it doesn't touch route or component code.

## Auth architecture — designed for SSO later without a redesign

`lib/auth/auth.config.ts` holds only session shape and route-authorization
rules (the `authorized`/`jwt`/`session` callbacks) — no providers, no
Prisma, no bcrypt. This is what `proxy.ts` runs on *every* request, so it
must stay cheap: it decodes the JWT cookie only, never hits the database.
`lib/auth/auth.ts` spreads that config and adds the actual provider
(Credentials today). This split is Auth.js's own documented pattern for
exactly this situation.

To add Microsoft Entra ID or Google Workspace SSO in a future phase:
1. Add the provider to the `providers` array in `lib/auth/auth.ts`.
2. Nothing in `auth.config.ts`, `proxy.ts`, or `lib/permissions/guard.ts`
   changes — they're already provider-agnostic.

The Prisma schema already includes the `Account`, `Session`, and
`VerificationToken` tables Auth.js's Prisma adapter expects, so no
migration is needed when that day comes. **One caveat found while
building this**: `@auth/prisma-adapter` currently imports its `PrismaClient`
type from the default `@prisma/client` export path, which Prisma 7's
custom-output generator (`lib/generated/prisma`) doesn't populate the same
way — wiring the adapter today throws a type error. This needs a look when
SSO work starts (likely fixed upstream by then, or solvable by generating
a second default-path client, or implementing the `Adapter` interface
directly against our client — all viable, none of them schema changes).

## RBAC model

*(Historical — Phase 0/Sequence 1 design. The role list below is still
current; the module/action matrix files referenced (`lib/rbac/permissions.ts`,
`lib/rbac/actions.ts`) were deleted in Phase 2 and replaced by the
finer-grained permission catalogue in `lib/permissions/`. See
[`docs/RBAC.md`](RBAC.md) for the current, authoritative model.)*

Roles (`lib/rbac/roles.ts`), as given directly in the working session:

`SYSTEM_ADMIN`, `PROGRAMME_DIRECTOR`, `PROGRAMME_SECRETARY`, `REVIEWER`,
`INTERVIEWER`, `SELECTION_COMMITTEE_MEMBER`, `EXECUTIVE`, `FELLOW` (no
module access until the Fellow Portal ships in V2 — the role exists now so
the schema and matrix don't change shape later).

**Resolved, Phase 0 — since superseded by Phase 3B.1:** the prototype's
own README/app-shell code used a different role vocabulary (`Eligibility
Reviewer`/`Application Reviewer` split, an `Observer` role, no `Programme
Director`) and a workflow-stage nav shell instead of separate module
routes. The V1.0 module list given for Sequence 1 planning dropped the
standalone Eligibility module and the Workflow shell, which resolved
this *by omission* at the time — one `REVIEWER` role, no `Observer`,
module-per-route navigation as originally built here. Action-level
permissions (below) covered the remaining case the prototype's prose
called out — Programme Secretary has read access to Executive Approval
but never approves — without needing a role split.
**Phase 3B.1 formally reopened and reconciled this**, per an explicit
approved PAM-P operational role list naming `Eligibility Reviewer` and
`Application Reviewer` separately — `REVIEWER` was split into
`ELIGIBILITY_REVIEWER`/`APPLICATION_REVIEWER` via a safe Postgres enum
migration; `Observer` remains absent (still expressed as view
permissions on approved roles, not a standalone role), matching this
section's original resolution. See
[`docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`](ROLE_AND_NAVIGATION_RECONCILIATION.md),
[`docs/RBAC.md`](RBAC.md), and
[`docs/PHASE_3B1_IMPLEMENTATION_REPORT.md`](PHASE_3B1_IMPLEMENTATION_REPORT.md)
for the full account.

### Action-level permissions

*(Historical — see [`docs/RBAC.md`](RBAC.md#the-permission-catalogue)
for the current equivalent: `lib/permissions/catalog.ts`'s `*.view`
permissions now cover the same "several roles can view, only one can
act" pattern described below.)*

`lib/rbac/actions.ts` sat alongside the module matrix for mutations that
don't map 1:1 to "can open this page": several roles can view the same
screen but only one may act on it. `lib/rbac/guard.ts#requireAction`
enforced it server-side, same as `requireModule` — module access gates
the page, action access gates the mutation, and both are checked on the
server regardless of what the UI shows or hides.

## Design tokens

Sourced directly from the frozen prototype
(`design_handoff_pamp_efms/README.md` and `EFMS.dc.html`), applied as CSS
custom properties in `app/globals.css`: navy `#08438A` primary, gold
`#C2802E` accent (reserved for emphasis — active nav state, notification
dots — not wired to shadcn's generic hover-surface `--accent` slot, to
avoid every dropdown/menu hover turning gold), 14px card radius, 6–8px
control radius, flat cards (border only, no shadow; floating layers —
dialogs, popovers, the mobile nav sheet — keep a shadow, since the
prototype's own toast does too), Inter typeface.

The prototype has no login-screen design (its README notes auth is
simulated via a role `<select>`, not a real login flow) — the login page
built here follows the same token system but isn't reproducing a specific
mock.

The sidebar/topbar shell (248px navy sidebar, 64px white topbar, logo
placement, nav item treatment) is reproduced structurally from
`EFMS.dc.html`. Module-level screens (Applicants, Reviewer Workspace,
etc.) aren't built yet, so their fidelity is unverified until Phase 1.

## Database

Phase 0 tables: `User`, `Account`/`Session`/`VerificationToken` (Auth.js
shape, unused until SSO), `AuditLog`. Sequence 1 adds `Cohort`,
`Applicant`/`Application`, `ApplicationDocument`, `ImportBatch`/
`ImportRowError`, `EligibilityCriterion`/`EligibilityDecision`,
`ReviewAssignment` (routing only), `SystemSetting`, `Notification` (table
only, no delivery yet). Phase 3A adds `ReviewStage`/`ReviewFramework`/
`ReviewCriterion`/`RatingScale`/`RatingScaleBand`/`Review`/`ReviewScore`.
Phase 3B extends `ReviewAssignment` with a full status lifecycle and
reassignment history, and adds `ReviewerCapacity`,
`ReviewConflictOfInterest`, `ReviewEscalation` — see
[`docs/database.md`](database.md#routing-vs-scoring-reviewassignment-vs-review).
See `prisma/schema.prisma`. Interview, Committee, Executive Approval, and
Admissions entities are added in later phases.

## Sequence 1 — applicant import, eligibility engine, applicant management

**Eligibility is a real workflow stage, automatic.** `Application.stage`
progresses `IMPORTED → UNDER_REVIEW → ...`; `eligibilityStatus`
(`PENDING`/`ELIGIBLE`/`INELIGIBLE`) is set by
`modules/eligibility/service.ts` immediately after import, per
application. Rules (`EligibilityCriterion`) reference a *whitelisted*
field key (`modules/eligibility/fields.ts`) plus an operator and value —
never a free-form expression — so an admin can add/edit/disable rules
from the Eligibility Criteria screen with no deploy, while the set of
possible *field types* stays a controlled, safe list. Every evaluation
writes an `EligibilityDecision` (itemized pass/fail per criterion, shown
on the Applicant Detail page) and an `AuditLog` entry. With zero criteria
configured, everything passes open by default — surfaced explicitly in
the UI, not a silent assumption. An admin can re-run the engine against
already-imported applications from the Eligibility Criteria screen after
changing rules.

**Reviewer auto-assignment (amendment 5)** runs immediately after an
application is marked eligible: `modules/reviews/services/
assignmentService.ts`'s `autoAssignReviewers` (originally
`modules/reviews/assignment.ts`, refactored into the full Phase 3B
assignment engine rather than left standalone — see
[`docs/REVIEW_ASSIGNMENT_ENGINE.md`](REVIEW_ASSIGNMENT_ENGINE.md)) assigns
the two eligible `REVIEWER` accounts with the fewest current assignments
(not a fixed round-robin index, so it stays balanced across multiple
import batches), ties broken by shuffle. It's idempotent — re-running
eligibility on an already-assigned application is a no-op for assignment,
not an error. Third-reviewer assignment on score divergence (amendment 4)
shipped in Phase 3B, once `Review` scores existed to diverge on; the
divergence threshold lives in `SystemSetting`, not hardcoded — see
[`docs/THIRD_REVIEW_ENGINE.md`](THIRD_REVIEW_ENGINE.md).

**Import** (`modules/import/`) is upload → column-mapping (admin maps
each source column to a core field, "keep as additional data," or
"ignore" — no fixed source schema assumed) → per-row zod validation →
transactional upsert keyed on `externalRef` when present, else `email`
(idempotent re-upload) → automatic eligibility evaluation for every
newly-imported row. Failures are per-row (`ImportRowError`), not
all-or-nothing — the admin gets "587 imported, 13 failed" with a specific
reason per failed row, not a dead-end error. The same `runImport()`
service is the intended seam for the future direct-API integration with
the application portal: a webhook endpoint would call it with rows
sourced from JSON instead of a parsed spreadsheet, no ingestion logic
duplicated.

**Three real bugs found and fixed via end-to-end testing** (not just
typecheck) — worth keeping as institutional memory:
1. SheetJS row objects carry a non-enumerable `__rowNum__` property that
   breaks React's Server Action → Client Component serialization
   boundary. Fixed by spreading each row (`{ ...row }`) before returning
   it, which keeps only enumerable properties.
2. A zod schema required the "value" form field as a non-nullable string,
   but the UI correctly omits that input entirely when the rule's
   operator is `EXISTS` — so `EXISTS` rules always failed to save.
   `formData.get()` returns `null` for an absent field; the schema now
   accepts `null`/`undefined` and coerces to `""`.
3. Two derived boolean fields (`hasEmail`/`hasPhone`) resolved to
   `true`/`false`, but the `EXISTS` operator checks for
   null/undefined/empty-string — so `hasPhone: false` still counted as
   "exists" and the rule passed vacuously for everyone. Fixed by exposing
   the raw `email`/`phone` fields instead and letting `EXISTS` check
   presence directly; a derived boolean and a presence-check operator
   don't compose.

## Known follow-ups

- **Import timeout risk at scale.** Rows are processed sequentially in
  one Server Action for correctness (per-row validation and upsert
  semantics don't fit `createMany`). Fine at 600 rows against a local or
  same-region Postgres instance; worth re-checking against Vercel's
  function duration limit on the actual deploy target before the real
  cutover, and worth knowing a background-job approach exists if it's
  ever needed — not built now, per "no unnecessary complexity."
- **SheetJS dependency.** `xlsx@0.18.5` (npm's latest published version)
  carries known advisories in code paths this app doesn't use (formula
  evaluation, legacy binary formats) — only `sheet_to_json` is called,
  and the import screen is restricted to System Administrator/Programme
  Secretary. Worth a periodic look for a patched release.
- **Document storage** is still unwired (flagged in Phase 0) —
  `ApplicationDocument` exists but nothing uploads to it yet.

## Environment variables

See `.env.example`. `DATABASE_URL` is a standard Postgres connection
string — works unchanged against Vercel Postgres/Neon/Supabase, Azure
Database for PostgreSQL, AWS RDS, or self-hosted Postgres. Nothing in the
app code is Vercel-specific; `AUTH_TRUST_HOST=true` is what's needed to
run Auth.js behind any host that isn't Vercel.

## Verified

Both phases were exercised end-to-end against a real local Postgres
instance, not just typechecked.

Phase 0: migration → seed → login → RBAC-gated Administration page →
create user → deactivate user → audit log rows written for each event →
sign out. Checked at 390px (mobile, incl. hamburger drawer), 820px
(tablet), 1440px (desktop).

Sequence 1: migration → seed (System Administrator + active Cohort) →
created two Reviewer accounts → created an eligibility rule → imported a
5-row sample CSV (4 valid, 1 deliberately invalid to verify per-row error
reporting) → confirmed automatic eligibility decisions, itemized reasons,
and automatic reviewer assignment (balanced 4/4 across the two reviewers)
via the UI, the audit trail, and direct database queries → added a
stricter rule after the fact and used "Re-run eligibility" to confirm an
application correctly flips Eligible→Ineligible with assignment left
untouched. Checked at 390px and 1440px.

## Phase 3B — review assignment engine and blind-review orchestration

Built the reusable assignment engine on top of Phase 3A's domain layer:
automatic first/second-reviewer assignment with workload balancing and
capacity/conflict-of-interest awareness, an `AssignmentStatus` lifecycle
for `ReviewAssignment` (parallel to `Review`'s `ReviewStatus`), authorised
reassignment that preserves history via a partial unique index rather
than mutating rows, and an automatic third-review escalation engine
triggered by a configurable percentage-point divergence threshold. No UI
shipped — `modules/reviews/services/assignmentService.ts` is the exact
service boundary a future Reviewer Workspace or Secretariat Workspace
calls into. See [`docs/REVIEW_ASSIGNMENT_ENGINE.md`](REVIEW_ASSIGNMENT_ENGINE.md),
[`docs/BLIND_REVIEW.md`](BLIND_REVIEW.md),
[`docs/THIRD_REVIEW_ENGINE.md`](THIRD_REVIEW_ENGINE.md),
[`docs/REVIEWER_WORKLOAD.md`](REVIEWER_WORKLOAD.md), and
[`docs/PHASE_3B_IMPLEMENTATION_REPORT.md`](PHASE_3B_IMPLEMENTATION_REPORT.md)
for the full detail, and [`docs/adr/`](adr/) for the two architecture
decision records this phase produced.

## Phase 3B.1 — role vocabulary, permission, and navigation reconciliation

Resolved the two open architecture items this document carried since
Phase 0 (see the "RBAC model" section above): the role vocabulary now
matches the approved PAM-P operational role list exactly (`REVIEWER`
split into `ELIGIBILITY_REVIEWER`/`APPLICATION_REVIEWER`, a safe Postgres
enum migration with every existing account preserved), and
`lib/navigation.ts` now maps one-to-one onto the approved 12-item
workflow taxonomy (Dashboard, Applicant Import, Eligibility Screening,
Application Review, Interview Management, Selection Committee, Executive
Approval, Admissions, Reports, Notifications, Audit Trail,
Administration). One governance question was left explicitly open — see
[`docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`](ROLE_AND_NAVIGATION_RECONCILIATION.md)
and
[`docs/PHASE_3B1_IMPLEMENTATION_REPORT.md`](PHASE_3B1_IMPLEMENTATION_REPORT.md)
for the full account and
[`docs/adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md`](adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md)
for the decision record.

## Phase 3C — Reviewer Workspace

Built the assigned queue (`/reviews`) and scoring form
(`/reviews/[assignmentId]`) — the first UI in this codebase driven
entirely by Phase 3A's scoring service and Phase 3B's assignment
service, with no new domain logic or schema change. Autosave, progress
indicators, an accessible per-criterion form (rating-scale bands as a
labelled radio group, a numeric input otherwise), and a locked read-only
summary once submitted — all within the existing navy/gold dashboard
shell, unchanged. See [`docs/REVIEWER_WORKSPACE.md`](REVIEWER_WORKSPACE.md),
[`docs/PHASE_3C_IMPLEMENTATION_REPORT.md`](PHASE_3C_IMPLEMENTATION_REPORT.md),
and
[`docs/adr/ADR-0010-reviewer-workspace-autosave-and-serialization.md`](adr/ADR-0010-reviewer-workspace-autosave-and-serialization.md).

## Phase 3D — Programme Secretariat Review Operations Workspace

Built the Secretariat's operational visibility and control over the
application-review stage: a dashboard, a filterable/paginated Assignment
Monitoring table, an application detail screen with side-by-side
reviewer scores and a reassignment dialog, reviewer workload, third-
review monitoring, a conflicts/recusals queue, administrative notes, a
full audit trail, and a permission-gated CSV export — a new,
deliberately separate `modules/reviewOperations/` read-model layer over
the same tables Phase 3A/3B already own, calling directly into Phase
3B's `assignmentService` for every mutation rather than reimplementing
assignment logic. No schema change. See
[`docs/PROGRAMME_SECRETARIAT_WORKSPACE.md`](PROGRAMME_SECRETARIAT_WORKSPACE.md),
[`docs/PHASE_3D_IMPLEMENTATION_REPORT.md`](PHASE_3D_IMPLEMENTATION_REPORT.md),
and
[`docs/adr/ADR-0011-review-operations-read-model.md`](adr/ADR-0011-review-operations-read-model.md)/
[`docs/adr/ADR-0012-operational-export-controls.md`](adr/ADR-0012-operational-export-controls.md).

## Release 1.5 — Enterprise Configuration Centre & Operational Governance

A platform-administration release, not a pipeline-stage phase: eliminated
every remaining hardcoded operational value this codebase actually had a
live consumer for, and closed out the two governance items earlier
phases had explicitly left open.

- **Configuration Centre** (`/administration/configuration`) — extends
  the `SystemSetting` generic key/value store Phase 3B introduced
  (rather than adding seven new tables) with a single registry
  (`lib/settings/registry.ts`) driving Review, Interview, Scoring,
  Notification, File Upload, and Security settings through one generic,
  audited accessor (`lib/settings/service.ts`) and one generic UI
  renderer. Programme/Cohort identity and every pipeline-stage date
  window (a new, small `ProgrammeWindow` model for the four windows with
  no schema home yet, reusing `ReviewStage.opensAt/closesAt` for the one
  that already had one) get their own structured screen. See
  [`docs/CONFIGURATION_CENTRE_GUIDE.md`](CONFIGURATION_CENTRE_GUIDE.md),
  [`docs/CONFIGURATION_REFERENCE.md`](CONFIGURATION_REFERENCE.md), and
  [`docs/adr/ADR-0013-configuration-centre-storage.md`](adr/ADR-0013-configuration-centre-storage.md).
- **Eligibility QA governance** — resolves ADR-0009's open question.
  `ELIGIBILITY_REVIEWER` gains exactly one write action (flag + recommend
  an override, `EligibilityRecommendation`, a new model); only
  `PROGRAMME_SECRETARY` can execute or dismiss it, and
  `Application.eligibilityStatus` is still only ever changed by the
  automatic engine or an executed override — never by the reviewer who
  flagged it. See
  [`docs/ELIGIBILITY_QA_GOVERNANCE.md`](ELIGIBILITY_QA_GOVERNANCE.md).
- **Risk Dashboard** — extends Phase 3D's `dashboardService` (not a
  second dashboard) with deadline/backlog/stall/overload signals,
  aggregated entirely from data Phase 3D's own screens already show
  individually.
- **Audit enhancement** — `AuditLog` already had `correlationId`/
  `ipAddress`/`userAgent` columns (Phase 2) that nothing populated; a new
  `AsyncLocalStorage`-based request context (`lib/audit/context.ts`),
  established once per request in the existing `requireSession`/
  `requirePermissionApi` guards, now threads them (plus new
  `requestId`/`sessionId` columns) through automatically — every one of
  the ~15 existing `writeAuditLog` call sites needed zero changes.
- **Feature flags** — six flags (Interview Module, Notifications,
  Executive Dashboard, Exports, Analytics, Future AI Assistant), stored
  through the same generic settings accessor, gating their features by an
  if-check at each feature's existing entry point rather than by removing
  code. See [`docs/FEATURE_FLAGS.md`](FEATURE_FLAGS.md).
- **Accessibility** — `@axe-core/playwright` integrated into the
  Playwright suite (`tests/e2e/accessibility.spec.ts`), covering WCAG 2
  A/AA (including colour contrast) and a keyboard-only interaction
  check, with this repository's first CI workflow
  (`.github/workflows/accessibility.yml`) running it on every push/PR.

Full detail:
[`docs/PHASE_RELEASE_1_5_IMPLEMENTATION_REPORT.md`](PHASE_RELEASE_1_5_IMPLEMENTATION_REPORT.md).

## Release 1, Module 1 — Interview Assignment Engine

The first module of the Release 1 "Core Selection Engine" overnight
build. Builds on schema (`Interview`, `InterviewPanelist`,
`InterviewerCapacity`, `InterviewConflictOfInterest`,
`RankingSnapshot`/`RankingSnapshotEntry`) and Configuration Centre
plumbing (Interview Configuration category, `feature.interview_module`
flag) that Release 1.5 deliberately left in place, unused, for this
module to pick up.

- **Shortlist generation** — ranks applications by
  `ApplicationScore.reviewAverage`, takes the configured
  `ranking.top70Size`, records the result as a `RankingSnapshot`.
  `reviewAverage` itself is populated by a new, deliberately minimal
  `ScoreAggregationService` (review-score half only — `interviewAverage`/
  `compositeScore`/`rank`/`rankingTier` remain Module 5's responsibility),
  hooked into the existing `onReviewSubmitted` flow.
- **Automatic panel assignment** — four panellists per interview, equal
  workload distribution, conflict/capacity-aware — built by importing
  Phase 3B's `filterEligibleReviewers` and `selectLeastLoadedReviewers`
  domain functions directly rather than duplicating them, per the
  module's own "reuse the existing Assignment Engine architecture"
  instruction.
- **Reassignment/cancellation** — same history-preservation pattern as
  `ReviewAssignment` (Phase 3B, ADR-0008): the old `InterviewPanelist`
  row is never mutated in place, only transitioned and linked to its
  replacement.

Full detail: [`docs/INTERVIEW_ASSIGNMENT_ENGINE.md`](INTERVIEW_ASSIGNMENT_ENGINE.md),
[`docs/adr/ADR-0015-review-score-aggregation-formula.md`](adr/ADR-0015-review-score-aggregation-formula.md).

**Flagged, not yet resolved:** `docs/database.md`'s `RankingTier` enum
and `ranking.top60Size` setting name document this programme's final
cohort size as **60**; Module 5 of the same overnight brief specifies
**"Top 30 selection"** — a genuine conflict, not a naming difference.
Module 1 doesn't depend on this number (only the consistent "Top 70"),
so it proceeded; Module 5 cannot begin until this is resolved.

## Release 1, Module 2 — Interview Workspace

The panellist-facing UI for scoring interviews: queue, applicant
summary, question framework, individual scoring with autosave, panel
comments, and independent submission — no schema migration needed, since
`InterviewScore`/`InterviewScoreEntry`/`InterviewCriterion` already had
every field this module reads or writes.

- **Scope split with Module 3** — the brief assigns "Configurable
  interview framework... Mandatory questions... Automatic averaging...
  Final interview score generation" to Module 3 explicitly, so Module 2
  deliberately stops at each panellist's own submission: a per-panellist
  raw total (reusing Phase 3A's weighted-sum primitives directly, since
  `InterviewCriterion` already has the `weight`/`maxScore` fields those
  functions need), not a cross-panellist average or final score. See
  ADR-0016 for the full boundary and why hard-requiring every question
  would have meant inventing Module 3's mandatory-questions policy early.
- **"Scores remain hidden until all four have submitted"** — enforced
  structurally: every service function operates on the caller's own
  interview/score id, never another panellist's, the same "no argument
  here could ever surface someone else's data" pattern
  `docs/BLIND_REVIEW.md` established for the Reviewer Workspace.
- **Autosave/view-model serialization** — identical mechanics to the
  Reviewer Workspace (ADR-0010): 1.2s debounce, Decimal→string
  boundary, `aria-live` status region.

Full detail: [`docs/INTERVIEW_WORKSPACE.md`](INTERVIEW_WORKSPACE.md),
[`docs/adr/ADR-0016-interview-workspace-scope-boundary.md`](adr/ADR-0016-interview-workspace-scope-boundary.md).
Playwright's accessibility suite now scans `/interviews` and
`/interviews/[interviewId]` on both desktop and mobile viewports —
zero violations found.

## Enterprise Functional Specification Addendum

Received mid-Release-1, after Modules 1–2 above were already committed.
Its own words: "This document supersedes any previous assumptions
regarding Interview Scheduling, Interview Scoring, Final Ranking and
Admissions." It replaces the original overnight brief's Modules 3–8 with
nine much more detailed modules (Interview Scheduling, Interview
Scoring, Interview Questions, Final Ranking, Tie-Breaking, Selection
Committee, Reserve List, Offer Management, Audit) and gives exact
numbers the original brief left ambiguous — notably **Application
Review (/60) + Interview (/40) = Final Score (/100)**, **Top 30**
confirmed by committee — which resolves the Top 30 vs Top 60/70
governance conflict flagged after Module 1 (the review stage was
already seeded at max 60; "Top 70" was always the interview-shortlist
size, a different number from the final cohort size, so nothing built
so far actually conflicts with this resolution).

**Governance checkpoint required and resolved**: Module 1 of the
Addendum ("Interview Scheduling") requires applicants to self-book a
slot, which needs *some* applicant-facing access — flatly at odds with
the Phase 0 "no Fellow Portal until V2" decision this codebase documents
as settled. Flagged to the user rather than guessed; resolved as a
secure, single-purpose, token-scoped booking link (not a portal, not
new authentication) — see
[ADR-0017](adr/ADR-0017-interview-booking-token-access.md).

### Interview Scheduling (Addendum Module 1)

Panel availability, candidate-slot generation (pure interval-
intersection math, respecting duration/buffer/daily-capacity — all three
now real consumers of Configuration Centre settings Release 1.5
deliberately pre-declared with zero consumer), applicant token-based
booking, Secretariat confirmation, Microsoft Teams link entry, and
invitation/reminder recording (no email/scheduler infrastructure exists
anywhere in this codebase — recorded and audited, never dispatched, the
same boundary Release 1.5 already established for all Notification
settings).

Full detail: [`docs/INTERVIEW_SCHEDULING.md`](INTERVIEW_SCHEDULING.md),
[ADR-0017](adr/ADR-0017-interview-booking-token-access.md). Playwright's
accessibility suite now covers the panellist availability screen, the
Secretariat scheduling operator screens, and the public booking page —
zero violations, desktop and mobile.

### Interview Scoring Revision (Addendum Module 2)

Revised the already-shipped Interview Workspace (Release 1 Module 2, old
brief) against the Addendum's more detailed scoring rules: four
structured comment fields replacing the single freeform one, a 3-of-4
minimum-submission threshold with an audited Secretariat override
("Close Interview with Three Valid Scores"), and post-submission "final
average" visibility to panellists (never other panellists' individual
scores/comments). Populates `ApplicationScore.interviewAverage`/
`interviewScoreCount` for the first time, ready for Module 4 (Final
Ranking) to consume.

Full detail: [`docs/INTERVIEW_SCORING_REVISION.md`](INTERVIEW_SCORING_REVISION.md),
[ADR-0018](adr/ADR-0018-interview-scoring-revision.md).

### Interview Questions (Addendum Module 3)

Gave `InterviewQuestion` (declared since Phase 1, unused until now) its
first writers: a Director/Admin-managed question bank (mandatory,
pathway-specific, and approved-bank categories), and a per-interview
session — starting it auto-records every active mandatory and
pathway-matching question as asked, panellists pick additional questions
only from the approved bank (never ad hoc), and ending it locks the
record. New `InterviewQuestionAsked` table gives full provenance: every
question asked, who selected each additional one, and the interview's
actual start/end time. Free-standing from the (unchanged)
`InterviewCriterion` scoring rubric Module 2 built — panellists see the
question framework as reference context, not a scoring input.

Full detail: [`docs/INTERVIEW_QUESTIONS.md`](INTERVIEW_QUESTIONS.md),
[ADR-0019](adr/ADR-0019-interview-questions.md).

### Final Ranking (Addendum Modules 4-5)

Combines `ApplicationScore.reviewAverage` (/60) and `.interviewAverage` (/40) into a
Final Score (/100) — a straight sum, no additional weighting, resolving the "should
review or interview count for more" question [ADR-0015](adr/ADR-0015-review-score-aggregation-formula.md)
explicitly left open. Ranks every eligible application, applying the addendum's exact
3-level tie-break rule (interview score, then review score, then a Final Selection
Committee decision with mandatory justification for anything still tied). Reuses the
`RankingSnapshot`/`RankingSnapshotEntry` mechanism `docs/database.md` already designed
for "Interview Shortlist" rather than a bespoke table, and resolves that same document's
long-open "what does `RankingTier` mean once the confirmed cohort size changed from
Top 70/60 to Top 30" question — see [ADR-0020](adr/ADR-0020-final-ranking-tier-resolution.md).

Full detail: [`docs/RANKING_ENGINE.md`](RANKING_ENGINE.md).

## Next: Selection Committee, Reserve List, Offer Management, and Audit (Addendum Modules 6–9)

Final Ranking unblocks the rest of the Addendum's modules, which now build on a real,
auditable, approvable ranked list and a Level 3 tie-flag record.
