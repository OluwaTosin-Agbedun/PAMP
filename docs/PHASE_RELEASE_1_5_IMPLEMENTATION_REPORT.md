# Release 1.5 Implementation Report — Enterprise Configuration Centre & Operational Governance

## 1. Implementation Summary

A platform-administration release: eliminated every hardcoded
operational value this codebase had a live consumer for, extended the
existing `SystemSetting` generic store (rather than seven new tables)
into a full Configuration Centre with seven categories, resolved the
open Eligibility Reviewer governance question from
[ADR-0009](adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md),
extended the Secretariat dashboard with a Risk Dashboard, wired the
audit schema's unused `correlationId`/`ipAddress`/`userAgent` columns
(plus two new ones) via an `AsyncLocalStorage` request context, built a
six-flag feature-flag system, and integrated axe-core accessibility
testing with this repository's first CI workflow. No Interview Engine,
Interview Scheduling, Notification Engine, Executive Approval, Offer
Management, or AI feature was started, per the brief's explicit scope
restriction.

## 2. Architecture Decisions (ADRs)

- [ADR-0013](adr/ADR-0013-configuration-centre-storage.md) — extend
  `SystemSetting`/`lib/settings/service.ts` rather than build seven new
  category tables; what genuinely needed new schema (`Programme.code`,
  `Cohort`'s intake window, `ProgrammeWindow`) and why.
- [ADR-0014](adr/ADR-0014-audit-context-async-local-storage.md) —
  `AsyncLocalStorage`-based audit context established in the existing
  `requireSession`/`requirePermissionApi` guards, so every existing
  `writeAuditLog` call site gained enrichment with zero changes.

## 3. Database Changes

Two migrations, both additive:

- `20260719133957_release_1_5_configuration_centre_schema` —
  `Programme.code` (nullable), `Cohort.applicationOpensAt`/
  `applicationClosesAt` (nullable), the new `ProgrammeWindow` model +
  `ProgrammeWindowCode` enum, `AuditLog.requestId`/`sessionId`
  (nullable).
- `20260719150957_release_1_5_eligibility_qa_governance` — the new
  `EligibilityRecommendation` model + `RecommendationStatus` enum.

No existing column was altered or dropped. No data backfill was needed
(every new column/table is nullable or has no pre-existing rows to
reconcile). `npx prisma migrate status` confirms 10 migrations total,
database up to date, no drift.

## 4. API Changes

New Server Actions/Route Handlers (all permission-gated, all audited):

- `app/(dashboard)/administration/configuration/actions.ts` —
  `updateSettingAction`, `updateProgrammeAction`, `updateCohortAction`,
  `updateProgrammeWindowAction`, `updateApplicationReviewWindowAction`.
- `app/(dashboard)/administration/feature-flags/actions.ts` —
  `setFeatureFlagAction`.
- `app/(dashboard)/applicants/[id]/actions.ts` (new file) —
  `createEligibilityRecommendationAction`,
  `executeEligibilityOverrideAction`,
  `dismissEligibilityRecommendationAction`.

No existing API contract changed shape — `parseImportFileAction`'s
signature is unchanged; it now additionally rejects on size/type before
parsing, returning the same `{ ok: false, error }` shape callers already
handle.

## 5. RBAC Changes

Five new permissions: `configuration.view`, `configuration.manage`
(occupying the slot the Phase 2 brief's unused `system.configure` was
reserved for — renamed, not duplicated), `eligibility_recommendations
.create`, `eligibility_override.execute`, `feature_flags.manage`.
`configuration.{view,manage}` granted to `SYSTEM_ADMIN`/
`PROGRAMME_DIRECTOR`/`PROGRAMME_SECRETARY` (the brief's "Director,
Programme Administrator, System Administrator" — `PROGRAMME_SECRETARY`
is labelled "Programme Secretary/Admin," the evidence-based mapping for
"Programme Administrator"). `eligibility_recommendations.create` to
`ELIGIBILITY_REVIEWER` only. `eligibility_override.execute` to
`PROGRAMME_SECRETARY` only (plus `SYSTEM_ADMIN`, which holds every
permission). `feature_flags.manage` to `SYSTEM_ADMIN` only. Full
reconciliation table: `docs/RBAC.md`.

## 6. UI Screens Added

- `/administration/configuration` — category landing page.
- `/administration/configuration/[category]` — Review, Interview,
  Scoring, Notification, File Upload, Security (one generic screen, six
  routes).
- `/administration/configuration/programme` — Programme/Cohort/window
  editor.
- `/administration/feature-flags` — six toggles.
- `/eligibility-recommendations` — Secretariat triage queue.
- `/review-operations/risk` — Risk Dashboard (sixth tab in the existing
  Review Operations Workspace).
- Applicant Detail page — new "Eligibility QA" card (flag/recommend for
  Eligibility Reviewers; execute/dismiss for Secretariat).

## 7. Documentation Added

`docs/CONFIGURATION_CENTRE_GUIDE.md`, `docs/CONFIGURATION_REFERENCE.md`,
`docs/OPERATIONAL_GOVERNANCE_GUIDE.md`,
`docs/ELIGIBILITY_QA_GOVERNANCE.md`, `docs/FEATURE_FLAGS.md`,
`docs/ADMINISTRATOR_GUIDE.md`, this report, ADR-0013, ADR-0014. Updated:
`docs/architecture.md` (Phase 3D's never-added section, plus this
release's), `docs/RBAC.md` (Phase 3D's never-added permission-table
rows, plus this release's), `docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`
(addendum for the two new nav items).

## 8. Test Results

- **Unit/integration** (`npx vitest run`): **281/281 passing, 25
  files** — 262 pre-existing (Phases 0 through 3D) plus 19 new
  (`tests/integration/release1_5Configuration.test.ts`,
  `tests/integration/release1_5Governance.test.ts`): setting get/set
  with registry defaults, range/read-only validation, audit-on-change,
  RBAC denial and multi-role access, Programme/Cohort/window updates,
  feature-flag defaults/access/toggle, Eligibility QA's full
  recommend → execute/dismiss lifecycle (including the raising reviewer
  denied self-execution, and a double-resolve rejected), Risk Dashboard
  access, and the audit-context fallback wiring itself (ambient context
  populates a row; an explicit field always wins).
- **End-to-end** (`npx playwright test`): **18/18 passing** — the
  existing 10 (Phase 3D) plus 8 new
  (`tests/e2e/accessibility.spec.ts`, ×2 projects: desktop + mobile)
  covering axe-core WCAG 2 A/AA scans of the login page, dashboard,
  Review Operations, Risk Dashboard, and three Configuration Centre
  screens, plus a keyboard-only interaction check.
- **Full verification**: `npx prisma validate`, `npx prisma migrate
  status`, `npx tsc --noEmit`, `npx eslint .`, `npm run build` — all
  clean. See §12 for the exact commands and results.

## 9. Accessibility Results

Zero critical/serious axe-core violations across every scanned screen
(login, dashboard, Review Operations, Risk Dashboard, Configuration
Centre landing/Security/Programme), under both `wcag2a` and `wcag2aa`
rule sets (which includes colour contrast). Keyboard-only interaction
confirmed on the Configuration Centre's boolean settings (a real,
editable switch is focusable and toggleable via Space, matching its
`aria-checked` state change; the read-only "Blind review" switch is
correctly excluded from the tab order, since it's `disabled`). No axe
scan was run against every screen in the codebase — scope was every
screen this session's phases (3B.1 through Release 1.5) built or
touched; Phase 0–3A screens were not re-scanned, since they predate this
session and weren't part of Release 1.5's own deliverable.

## 10. Known Limitations

- **`review.reviewers_per_application` is read-only** — the assignment
  engine's `FIRST`/`SECOND` slot model is structurally built for exactly
  two initial reviewers; making this genuinely configurable is an
  assignment-engine redesign, out of scope ("do not redesign existing
  architecture").
- **Interview, Notification, and most File Upload settings have no
  consumer** — by the brief's own instruction for those categories
  ("configuration only, no functionality").
- **`security.session_timeout_minutes` is not live** — Auth.js's JWT
  config loads at process start; a change takes effect on the next
  restart/deploy.
- **No automated failed-login lockout** — `security.failed_login
  _threshold`/`account_lock_duration_minutes` are stored and validated
  but not enforced; this codebase has never had this mechanism
  (documented as "reserved for future" since Phase 2) and building it
  under this release's time constraints would have meant under-testing a
  security-critical path. See `docs/OPERATIONAL_GOVERNANCE_GUIDE.md`
  Principle 5.
- **Eligibility override doesn't touch `Application.stage`** — only
  `eligibilityStatus`. If an application's stage needs to change as a
  consequence of a late override, that remains a separate manual
  action. See `docs/ELIGIBILITY_QA_GOVERNANCE.md`.
- **No dedicated Audit Trail viewer UI** — a pre-existing gap
  (`lib/navigation.ts`'s "Audit Trail" item has been `implemented:
  false` since Phase 3B.1); Release 1.5 made the underlying data richer
  but didn't build the screen, which wasn't in scope.
- **"Applications requiring attention" on the Risk Dashboard is an
  approximation** — the maximum of its contributing signals, not a true
  set union across application IDs (documented in
  `dashboardService.getRiskDashboard`'s own comment) — a deliberate
  trade-off against re-fetching every signal's ID list a second time
  purely to deduplicate one summary number.
- **CI is new to this repository** — `.github/workflows/
  accessibility.yml` is the first workflow of any kind here; it covers
  the accessibility spec only, not the full verification suite (build,
  full test suite), which remains a manual/session-driven step.

## 11. Readiness Assessment for the Interview Engine

What's already in place for whichever phase builds it next:

- **Configuration**: `interview.*` settings (panellist count, duration,
  passing score, weighting, tie-break rule, reserve list size,
  scheduling window) are stored, validated, and editable today — the
  Interview Engine's first task is to read them, not invent where they
  live.
- **The Interview date window**: `ProgrammeWindow` rows with `code:
  "INTERVIEW"` are ready to read/write, following the exact pattern
  `getActiveReviewStage` already uses for the Application Review Window.
- **The feature flag**: `feature.interview_module` exists, defaulting
  off — the Interview Engine ships behind it from day one, no new flag
  plumbing needed.
- **The governance pattern to reuse**: Release 1.5's "recommend vs.
  execute" split (`docs/OPERATIONAL_GOVERNANCE_GUIDE.md` Principle 1) is
  directly applicable if interview scoring needs a similar QA step
  (e.g. a panellist flags a score dispute, a chair resolves it).
- **What still needs deciding, not guessed at here**: the interview
  assignment model (1:1 interviewer↔applicant vs. panel-based — Phase
  3B's assignment-engine *pattern* is reusable, its `FIRST`/`SECOND`
  *slot* concept is not, since Interview Configuration's panellist count
  is plural and configurable); whether interview scoring reuses Phase
  3A's `ReviewFramework`/`ReviewCriterion` machinery or needs its own;
  and an interviewer capacity/workload model analogous to Phase 3D's
  Reviewer Workload, once scheduling exists to generate load. None of
  these are answered by Release 1.5 — they're the Interview Engine
  phase's own design decisions, flagged here as the concrete open
  questions rather than left implicit.

## 12. Verification commands and results

```
npx prisma validate           — clean
npx prisma migrate status     — 10 migrations, up to date, no drift
npx tsc --noEmit               — clean
npx eslint .                   — clean
npx vitest run                 — 281/281 passing, 25 files
npx playwright test            — 18/18 passing (desktop + mobile)
npm run build                  — compiles, typechecks, generates every route
```
