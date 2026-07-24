# Phase 3D Implementation Report — Programme Secretariat Review Operations Workspace

## 1. Executive summary

Phase 3D gives the Programme Secretariat operational visibility and
limited control over the application-review stage — dashboard, an
assignment monitoring table, a per-application detail/reassignment
screen, reviewer workload, third-review monitoring, a conflicts/
recusals queue, and a CSV export — built entirely against Phase 3A's
scoring engine and Phase 3B's assignment engine. No schema change. No
score mutation path. No Interview/Committee/Executive/Admissions/
notification functionality shipped, per the brief's explicit scope
boundary.

One real bug was found and fixed during testing (not merely a type
error): an "active assignment" status filter that excluded `COMPLETED`
caused fully-submitted, non-diverging applications to silently vanish
from both the dashboard's "applications assigned" count and the
Assignment Monitoring table. See §3 and ADR-0011.

## 2. Files created and modified

### Created

- **Data layer**: `modules/reviewOperations/{types.ts, repositories/
  {dashboardRepository, assignmentMonitoringRepository,
  escalationMonitoringRepository, workloadRepository,
  conflictQueueRepository, auditTrailRepository,
  applicationDetailRepository}.ts, services/{dashboardService,
  assignmentMonitoringService, escalationMonitoringService,
  workloadService, conflictQueueService, exportService,
  applicationDetailService}.ts, validation/schemas.ts}`
- **Notes module**: `modules/notes/{repository,service}.ts` — reuses the
  pre-existing, previously-unused `Note`/`NoteVisibility` schema for
  Administrative Notes.
- **Routes**: `app/(dashboard)/review-operations/{page, workspace-nav}
  .tsx`, `.../assignments/{page, filter-bar}.tsx`, `.../assignments/
  export/route.ts`, `.../assignments/[applicationId]/{page, actions,
  reassign-dialog, notes-panel, declare-conflict-form}.tsx`, `.../
  workload/page.tsx`, `.../escalations/page.tsx`, `.../conflicts/
  page.tsx`
- **Tests**: `tests/integration/reviewOperations.test.ts` (12 tests),
  `tests/e2e/reviewOperations.spec.ts` (5 tests × 2 Playwright
  projects), `tests/e2e/fixtures/manage.ts` (fixture setup/teardown/
  verification subprocess — see §3)
- **Config**: `playwright.config.ts`
- **Docs**: `docs/PROGRAMME_SECRETARIAT_WORKSPACE.md`,
  `docs/REVIEW_OPERATIONS.md`, `docs/REVIEW_REASSIGNMENT.md`,
  `docs/REVIEW_MONITORING_AND_ESCALATION.md`, this file,
  `docs/adr/ADR-0011-review-operations-read-model.md`,
  `docs/adr/ADR-0012-operational-export-controls.md`

### Modified

- `lib/permissions/catalog.ts` — four new permissions:
  `review_operations.view`, `review_escalations.view`,
  `review_operations.export`, `administrative_notes.create`.
- `lib/permissions/rolePermissions.ts` — the four new permissions added
  to `PROGRAMME_OVERSIGHT` (Director/Admin) and explicitly to
  `PROGRAMME_SECRETARY`'s array.
- `lib/audit/actions.ts` — `ADMINISTRATIVE_NOTE_CREATED`,
  `REVIEW_OPERATIONS_EXPORTED`.
- `lib/navigation.ts` — one new nav entry, "Review Operations", nested
  inside the existing "Application Review" group (not a new top-level
  taxonomy item — see §3).
- `package.json`/`package-lock.json` — `@playwright/test@^1.61.1` and
  `playwright@^1.61.1` added as dev dependencies.
- `.gitignore` — `/test-results/`, `/playwright-report/`,
  `/tests/e2e/fixtures/.fixture.json` added (Playwright run artifacts
  and the e2e fixture-tracking file are not committed).

No schema migration this phase — every new read/write is against
tables Phase 3A/3B/the original database design already created.

## 3. Design decisions

Full reasoning in [ADR-0011](adr/ADR-0011-review-operations-read-model.md)
(read-model shape, pagination, the `COMPLETED`-status bug) and
[ADR-0012](adr/ADR-0012-operational-export-controls.md) (export column
minimisation, permission separation). Summarized:

- **Separate module tree** (`modules/reviewOperations/`), not an
  extension of `modules/reviews/` — oversight-shaped queries (broad,
  cross-reviewer) are kept structurally apart from the assignment
  engine's reviewer-scoped queries, so a query never accidentally
  crosses the blind-review boundary.
- **Every mutation delegates to Phase 3B** — reassignment, conflict
  declaration, and capacity all call `assignmentService` functions
  directly; this phase's own write surface is limited to Administrative
  Notes and the export audit event.
- **In-memory pagination** over a cohort-scoped dataset, not two-phase
  SQL pagination — justified by this system's documented small scale
  (a few hundred applications per cohort).
- **Two status-set constants** (`ASSIGNED_OR_COMPLETED_STATUSES` for
  "is this application assigned at all," a narrower "currently active"
  set for load/utilisation math) — the fix for the `COMPLETED`-status
  bug described in §1.
- **"Due date" reuses `ReviewStage.closesAt`**; **"assignment batch"**
  is interpreted as an assigned-date range filter — neither concept
  exists in the schema; both are deliberate, non-inventive
  interpretations, not new fields.
- **Nav placement**: `/review-operations` nests inside the existing
  "Application Review" group with its own in-page tab strip
  (`workspace-nav.tsx`), rather than becoming a 13th top-level sidebar
  item — Phase 3B.1's approved 12-item taxonomy stays closed.
- **Playwright/Prisma ESM incompatibility**: Prisma 7's generated client
  is ESM-only TypeScript (`import.meta`), which Playwright Test's own
  spec-file transform cannot load (unlike Vitest's Vite-based
  transform). Fixed by moving all Prisma-touching fixture logic into a
  separate `tsx` subprocess (`tests/e2e/fixtures/manage.ts`, invoked via
  `execFileSync`) — the spec file itself never imports `@/lib/db/prisma`
  or any `"server-only"`-tagged module.

## 4. Permission model

See `docs/REVIEW_OPERATIONS.md`'s full reconciliation table. Summary:
six of the brief's ten suggested permissions map onto Phase 3B
permissions that already existed under a different name (reused, not
duplicated); four are genuinely new. All ten are granted to
`PROGRAMME_SECRETARY`/`PROGRAMME_DIRECTOR`/`SYSTEM_ADMIN` only. Every
mutation re-checks its permission server-side via `requirePermission`
inside the service layer — never trusted from page-level gating alone,
confirmed by `tests/integration/reviewOperations.test.ts`'s
unauthorised-access tests (an `APPLICATION_REVIEWER` actor gets a
thrown `AuthorisationError` from every one of the five services) and by
the Playwright direct-URL-access test (a blocked role hitting
`/review-operations` directly is redirected server-side to
`/access-denied`, not merely hidden from the sidebar).

## 5. Testing

**Integration** (`tests/integration/reviewOperations.test.ts`, 12
tests): authorised access to all five services; unauthorised denial;
correct dashboard totals against a known two-application fixture
(including the post-fix `COMPLETED` case); programme/cohort isolation
across two independent fixtures; reassignment preserving assignment
history (`reassignedFromId`, old row's status/`reviewerId`); conflict
queue showing an admin-recorded conflict; third-review monitoring
showing the correct scores, divergence, and resolved final score;
export requiring `review_operations.export` specifically (not just
`review_operations.view`) and writing an audit row with `rowCount`;
export excluding email/individual scores (data minimisation);
pagination and every filter; reviewer workload capacity/utilisation;
administrative notes' timestamp/attribution/audit trail.

**End-to-end** (`tests/e2e/reviewOperations.spec.ts`, 5 tests × 2
Playwright projects — `desktop-chromium` 1280×900,
`mobile-chromium` a Pixel 7 viewport — 10 total): dashboard totals in a
real browser; the Assignment Monitoring table plus an actual CSV file
download; the application detail page's side-by-side reviewer scores/
comments plus a real reassignment performed through the dialog UI,
independently re-verified against the database afterward; the three
secondary pages (workload, escalations, conflicts) rendering; a blocked
role's direct URL access being denied server-side. All 10 pass on both
projects.

Two real defects surfaced and were fixed during this testing pass (not
pre-existing test-writing mistakes):

1. **The `COMPLETED`-status bug** (§1/§3) — a genuine data-visibility
   bug in the monitoring/dashboard read queries, not a test issue.
2. **`applicationDetailRepository`'s "assigned reviewers" list** had the
   same narrow-status-filter bug, independently — a fully-submitted
   application's reviewers/scores were invisible on its own detail page
   (showing "No active assignment"). Fixed the same way, in the same
   commit, once the Playwright test caught it (`docs/adr/
   ADR-0011-review-operations-read-model.md` documents the fix; the
   underlying pattern is identical to the monitoring-table fix).

Two test-authoring issues (not product bugs) were also found and fixed:
a Playwright locator ambiguity (`getByLabel("Reason")` matched both the
conflict form's and the reassign dialog's textareas — fixed by scoping
the dialog's own locators to `page.getByRole("dialog")`), and two
assertions reading `page.locator("body").innerText()` immediately after
`page.goto()` without waiting for a stable heading first — fixed by
adding an explicit `await expect(...).toBeVisible()` wait before each
read, per Playwright's own auto-retrying-assertion best practice.

**Full existing suite**: `npx vitest run` — 260/260 passing across 23
files (no regression from Phase 3B/3B.1/3C's 260 baseline — Phase 3D
added 12 of those 260 via its own integration test file; the numeric
match is coincidental, not a sign nothing changed).

## 6. Verification

- `npx prisma validate` — clean (no schema change this phase).
- `npx prisma migrate status` — up to date, 8 migrations, no drift.
- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 260/260 passing, 23 files.
- `npx playwright test` — 10/10 passing (`desktop-chromium` +
  `mobile-chromium`).
- `npm run build` — compiles, typechecks, and generates all routes
  (including the seven new `/review-operations*` routes) successfully.

## 7. Known limitations

- **In-memory pagination** assumes cohort sizes in the low hundreds;
  documented as a scale assumption in ADR-0011, not a hidden ceiling.
- **No "recuse a reviewer" mutation** — the conflicts/recusals queue can
  display a recusal (`Review.status = RECUSED`) but nothing in this
  codebase currently sets that status; see
  `docs/REVIEW_MONITORING_AND_ESCALATION.md`.
- **Overdue detection uses a single stage-wide `closesAt`**, not a
  per-assignment due date — there is no per-assignment due-date field in
  the schema.
- **CSV export, not native `.xlsx`** — satisfies "Excel-compatible" via
  a UTF-8-BOM-prefixed CSV; see ADR-0012 for why a generated binary
  wasn't built.

## 8. What's next

Per the brief: **stop here.** The Interview Engine is not started. The
natural next phase, per the roadmap referenced across Phase 3B.1/3C/3D,
is the Interview module (scope explicitly excluded from this phase) —
see the consolidated report's "recommended Interview Engine scope"
section for what that phase would need to reconcile against this one
(interview scheduling likely needs its own reviewer-workload-style
capacity view; interview outcomes would need their own Secretariat
oversight screen analogous to this phase's, once that phase's brief
defines its rules).
