# Programme Secretariat Review Operations Workspace

Phase 3D. Gives the Programme Secretariat (and Programme Director /
System Administrator, via the same `PROGRAMME_OVERSIGHT` permission
group) operational visibility and limited control over the application-
review stage, without compromising blind-review independence between
Reviewer 1 and Reviewer 2. Built entirely against Phase 3A's scoring
engine and Phase 3B's assignment engine — no schema change, and every
mutation goes through Phase 3B's already-tested `assignmentService`
rather than a new write path.

## What this phase built

- **Review Operations dashboard** (`/review-operations`) — cohort-wide
  totals: eligible applications, assigned / awaiting assignment, reviews
  not started / in progress / submitted / overdue, recusals,
  reassignments, third reviews triggered / outstanding, stage completion
  %, reviewer utilisation %. See `docs/REVIEW_OPERATIONS.md`.
- **Assignment Monitoring table** (`/review-operations/assignments`) —
  one row per application: reviewers, assignment status, review
  progress, assigned/due/submitted dates, conflict flag, third-review
  flag. Server-paginated, filterable (reviewer, status, pathway,
  overdue, conflict, third review, assigned-date range). See
  `docs/REVIEW_MONITORING_AND_ESCALATION.md`.
- **Application detail + reassignment**
  (`/review-operations/assignments/[applicationId]`) — both reviewers'
  scores and comments shown side by side for oversight, a reassignment
  dialog, a conflict-of-interest form, administrative notes, and the
  full audit trail for that application. See
  `docs/REVIEW_REASSIGNMENT.md`.
- **Reviewer Workload view** (`/review-operations/workload`) — per-
  reviewer active/completed counts, configured capacity, utilisation %.
- **Third-Review Monitoring** (`/review-operations/escalations`) —
  which applications triggered a third review, the divergence, the
  first two scores, third-reviewer assignment/completion status, the
  resolved final score. Read verbatim from Phase 3B's `ReviewEscalation`
  rows — nothing here recalculates a formula. See
  `docs/REVIEW_MONITORING_AND_ESCALATION.md`.
- **Conflicts & Recusals queue** (`/review-operations/conflicts`) — a
  read-only merge of admin-recorded conflicts
  (`ReviewConflictOfInterest`) and any review a reviewer has recused
  from (`Review.status = "RECUSED"`).
- **Operational export** — CSV download from the Assignment Monitoring
  table, permission-gated separately from viewing, audited, and
  deliberately excluding scores/comments/emails. See
  [ADR-0012](adr/ADR-0012-operational-export-controls.md).

## What this phase explicitly did not build

Per the brief's scope boundary: no Interview module, no Committee
module, no Executive Approval, no Admissions, no applicant-facing
notifications, no email delivery, no final-selection functionality. The
"Notifications" nav slot added in Phase 3B.1 remains `implemented:
false`.

## Secretariat access rules (enforced, not just documented)

The Secretariat **may**: view assignment status, reviewer identities,
submitted reviewer comments and scores where approved, initiate a
reassignment (via Phase 3B's engine, with a mandatory reason), record
administrative notes, monitor divergence/third-review status, and export
authorised operational data.

The Secretariat **must not** — and the implementation enforces this
structurally, not just by convention:

- **Alter a reviewer's submitted score directly.** No mutation anywhere
  in `modules/reviewOperations/` writes to `Review.totalScore` or
  `ReviewScore`. The only way a score changes is a reviewer's own
  `reviewService.saveDraftScores`/`submitReview` (Phase 3A), which this
  module never calls.
- **Impersonate a reviewer or submit on their behalf.** No Server Action
  in this phase accepts a review payload; reassignment changes *who* is
  assigned, never submits a review as them.
- **Modify a published framework.** `modules/reviewFramework` isn't
  imported anywhere in `modules/reviewOperations/`.
- **Reveal one reviewer's work to another reviewer.** The side-by-side
  score/comment view exists only on the Secretariat's own
  `/review-operations/assignments/[applicationId]` page, gated by
  `review_operations.view`, which no `APPLICATION_REVIEWER` holds (see
  `tests/integration/reviewOperations.test.ts`'s unauthorised-access
  tests and the Playwright direct-URL-access test).
- **Manually overwrite a calculated aggregate score.** `ReviewEscalation
  .resolvedFinalScore` is displayed, never edited — no form field, no
  action, writes to it anywhere in this module.

## Permission model

| Permission | New this phase? | Reused from | Meaning |
|---|---|---|---|
| `review_operations.view` | Yes | — | Dashboard, monitoring table, application detail, workload, escalations, conflicts — the base "can see the workspace" grant. |
| `assignments.view` | No | Phase 3B | Underlies the monitoring/detail read queries (brief's suggested `review_assignments.view`). |
| `assignments.reassign` | No | Phase 3B | Gates the reassignment dialog and action. |
| `conflicts.manage` | No | Phase 3B | Gates recording a conflict of interest. |
| `review_escalations.view` | Yes | — | Third-review monitoring page. |
| `review_scores.view` | No | Phase 3B | Underlies showing submitted scores/comments (brief's `review_results.view`). |
| `reviewer_capacity.view` | No | Phase 3B | Underlies the Reviewer Workload view (brief's `reviewer_workload.view`). |
| `review_operations.export` | Yes | — | CSV export — deliberately distinct from `review_operations.view`; see ADR-0012. |
| `administrative_notes.create` | Yes | — | Adding an administrative note. |
| `audit.view` | No | Phase 2 | Underlies the audit trail panel. |

Four genuinely new permissions were added; the rest of the brief's
suggested permission list maps onto capabilities Phase 3B already had a
permission for — see `docs/REVIEW_OPERATIONS.md` for the full
reconciliation reasoning. All four new permissions, plus the six reused
ones, are granted to `PROGRAMME_SECRETARY`, `PROGRAMME_DIRECTOR`, and
`SYSTEM_ADMIN` (`lib/permissions/rolePermissions.ts`'s
`PROGRAMME_OVERSIGHT` group plus `PROGRAMME_SECRETARY`'s own array); no
other role holds any of them.

## Navigation placement

`/review-operations` is **not** a 13th top-level sidebar item. Phase
3B.1 closed the approved 12-item navigation taxonomy deliberately; this
phase nests as a second item inside the existing "Application Review"
group (`lib/navigation.ts`), with its own in-page tab strip
(`workspace-nav.tsx`: Dashboard / Assignments / Reviewer Workload /
Third Reviews / Conflicts & Recusals) for moving between the five
Secretariat routes. Nav visibility is not authoritative — every route is
independently guarded server-side by `requirePagePermission`, confirmed
by a direct-URL-access Playwright test for a role without the
permission.

## Audit coverage

Every mutation in this phase writes an audit row: reassignment (reuses
Phase 3B's `ASSIGNMENT_REASSIGNED`), conflict declaration (reuses
Phase 3B's `CONFLICT_DECLARED`), administrative note creation
(`ADMINISTRATIVE_NOTE_CREATED`, new this phase), and operational export
(`REVIEW_OPERATIONS_EXPORTED`, new this phase, recording `rowCount`).
Nothing in this phase reads audit data without `audit.view`.

## Testing

- `tests/integration/reviewOperations.test.ts` (12 tests): authorised
  access to all five services, unauthorised denial, correct dashboard
  totals against a known fixture, programme/cohort isolation,
  reassignment history preservation, conflict-queue correctness,
  third-review monitoring accuracy (score aggregation matches Phase 3B's
  own computed value, not a UI recalculation), export permission
  distinct from view permission plus its audit event, export data-
  minimisation, pagination/filter correctness, reviewer workload
  figures, administrative-note attribution.
- `tests/e2e/reviewOperations.spec.ts` (5 tests × 2 Playwright
  projects, desktop and mobile): dashboard totals in a real browser,
  the monitoring table plus a real CSV download, the application detail
  page's side-by-side scores plus an actual reassignment performed
  through the UI (verified via a fixture-management subprocess, not
  Playwright's own process — see "Playwright and the ESM Prisma
  client" below), the three secondary pages rendering, and a blocked
  role's direct-URL access being denied server-side.

### Playwright and the ESM Prisma client

Prisma 7's generated client (`lib/generated/prisma/client.ts`) is
ESM-only TypeScript using `import.meta`. Vitest handles this natively
(Vite's transform supports ESM); Playwright Test's own spec-file
transform does not, and fails immediately with `SyntaxError: Cannot use
'import.meta' outside a module` if a spec imports it directly. Fixture
setup, teardown, and the one in-test DB read (confirming reassignment
history) run in a separate `tsx` subprocess
(`tests/e2e/fixtures/manage.ts`, invoked via `execFileSync`), the same
way this repo's manual browser-verification scripts already run Prisma
code outside Vitest/Next's compilation context. The spec file itself
never imports `@/lib/db/prisma` or any `"server-only"`-tagged module.

## Full detail docs

- `docs/REVIEW_OPERATIONS.md` — the dashboard, its query service, and
  the permission reconciliation.
- `docs/REVIEW_REASSIGNMENT.md` — the reassignment workflow and its
  guarantees.
- `docs/REVIEW_MONITORING_AND_ESCALATION.md` — the Assignment Monitoring
  table, third-review monitoring, and the conflicts/recusals queue.
- `docs/PHASE_3D_IMPLEMENTATION_REPORT.md` — files, decisions,
  verification results.
- [ADR-0011](adr/ADR-0011-review-operations-read-model.md) — why this
  phase's read model is a separate module tree, pagination strategy, and
  the `COMPLETED`-status bug and fix.
- [ADR-0012](adr/ADR-0012-operational-export-controls.md) — export
  column minimisation and permission separation.
