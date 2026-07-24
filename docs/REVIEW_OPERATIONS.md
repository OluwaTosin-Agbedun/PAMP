# Review Operations Dashboard

The Secretariat's cohort-wide summary of the application-review stage
(`/review-operations`), and the reconciliation record for how Phase 3D's
suggested permission names map onto what already existed.

## Metrics

`modules/reviewOperations/services/dashboardService.ts`'s
`getReviewOperationsDashboard(actorId, programmeId, cohortId)` returns:

| Metric | Source |
|---|---|
| Eligible applications | `Application` count, `eligibilityStatus = ELIGIBLE`, scoped to cohort. |
| Applications assigned | Distinct applications with an assignment in `ASSIGNED_STATUSES` (includes `COMPLETED` — see ADR-0011). |
| Applications awaiting assignment | Eligible applications minus assigned. |
| Reviews not started | `Review` rows with `status = NOT_STARTED`, **plus** active assignments with no `Review` row yet at all (a `Review` isn't created until the reviewer opens the scoring page — Phase 3A/3C — so an unopened assignment must still count as "not started," not be invisible). |
| Reviews in progress | `Review.status = IN_PROGRESS`. |
| Reviews submitted | `Review.status = SUBMITTED`. |
| Reviews overdue | Active, unsubmitted assignments past the active `ReviewStage.closesAt`. |
| Recusals | `Review.status = RECUSED` count. |
| Reassignments | `ReviewAssignment.status = REASSIGNED` count (history rows, never deleted). |
| Third reviews triggered | `ReviewEscalation` count for the cohort. |
| Third reviews outstanding | Escalations with `resolvedFinalScore` still null. |
| Stage completion % | Submitted reviews ÷ expected reviews for eligible applications. |
| Reviewer utilisation % | Active application-reviewer assignment load ÷ total configured capacity (`ReviewerCapacity`, Phase 3B). |

Every figure is produced by `dashboardService`/`dashboardRepository` —
per the brief's "use `DashboardService` or an equivalent central query
service; do not place aggregate query logic directly in page
components" instruction, `app/(dashboard)/review-operations/page.tsx`
contains no query logic of its own, only rendering.

## Permission reconciliation

The brief suggests a permission list (`review_assignments.view`,
`review_conflicts.manage`, `review_results.view`,
`reviewer_workload.view`, …) that is, in every case but four, identical
in meaning to a permission Phase 3B already defined under a different
name. Rather than add a second, parallel permission for the same
capability, this phase reused the existing ones:

| Brief's suggested name | Existing permission used | Why reused, not duplicated |
|---|---|---|
| `review_assignments.view` | `assignments.view` (Phase 3B) | Identical meaning — "can see assignment records." |
| `review_assignments.reassign` | `assignments.reassign` (Phase 3B) | Identical meaning, and reassignment *is* Phase 3B's engine. |
| `review_conflicts.manage` | `conflicts.manage` (Phase 3B) | Identical meaning. |
| `review_results.view` | `review_scores.view` (Phase 3B) | Identical meaning — "can see submitted scores/comments." |
| `reviewer_workload.view` | `reviewer_capacity.view` (Phase 3B) | Identical meaning — capacity *is* the workload figure. |
| `audit.view` | `audit.view` (Phase 2) | Already exists, unchanged. |

Only four permissions were genuinely new, because no existing permission
covered their capability: `review_operations.view` (the dashboard-as-a-
whole and the base workspace grant), `review_escalations.view` (third-
review monitoring detail), `review_operations.export` (deliberately
separate from viewing — see ADR-0012), `administrative_notes.create`
(a capability that didn't exist before this phase at all).

This keeps `lib/permissions/catalog.ts` from accumulating synonymous
identifiers for the same underlying check, and means every Phase 3B
test that already asserted `assignments.reassign`/`conflicts.manage`/etc.
behaviour continues to cover Phase 3D's use of the same checks, with no
duplicated test surface.

## Cohort/programme scoping

Every dashboard and monitoring query takes `programmeId`/`cohortId`
explicitly (resolved from `getActiveCohort()`, Sequence 1's single-
active-cohort convention) rather than querying globally — confirmed by
`tests/integration/reviewOperations.test.ts`'s isolation test, which
builds two separate cohort fixtures and asserts neither's counts leak
into the other's.

## Related docs

- `docs/PROGRAMME_SECRETARIAT_WORKSPACE.md` — overview and access rules.
- [ADR-0011](adr/ADR-0011-review-operations-read-model.md) — the
  `COMPLETED`-status bug this phase found and fixed, and why.
