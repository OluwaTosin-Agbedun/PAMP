# Assignment Monitoring, Third-Review Monitoring, and Conflicts/Recusals

## Assignment Monitoring table

`/review-operations/assignments`
(`modules/reviewOperations/services/assignmentMonitoringService.ts`'s
`getAssignmentMonitoring`) is one row per application in the active
cohort (optionally narrowed by pathway at the query level), server-
paginated at 25 rows/page.

### Columns

Application number, pathway, assigned reviewers (slot + name per
reviewer), overall status, assigned date, due date, flags (overdue /
conflict / third review). "Submitted date" per reviewer and each
reviewer's individual assignment/review status are available in the row
data (`AssignmentRowReviewer`) and shown on the application detail page;
the table itself keeps to the brief's listed columns.

### `overallStatus` derivation

Computed by `deriveOverallStatus`, in priority order:

1. No reviewers assigned → `AWAITING_ASSIGNMENT`.
2. Any reviewer's assignment is `ESCALATED` → `ESCALATED`.
3. Every reviewer has completed (`assignmentStatus = COMPLETED` or
   `reviewStatus = SUBMITTED`) → `SUBMITTED`.
4. Every reviewer's review is unstarted or absent → `NOT_STARTED`.
5. Otherwise → `IN_PROGRESS`.

Nothing here recalculates a score or re-derives eligibility — every
input is a stored `AssignmentStatus`/`ReviewStatus` enum value.

### Filters

Reviewer, status (`overallStatus`), pathway, overdue-only, conflict-
only, third-review-only, and an assigned-date range
(`assignedFrom`/`assignedTo`) standing in for the brief's "assignment
batch" filter — this schema has no batch-identifier concept (assignment
runs per application, not in tracked batches); see ADR-0011 for why a
date range is the deliberate, non-inventive substitute.

### "Due date"

There is no per-assignment due-date field in the schema. Every row's due
date is the active `ReviewStage.closesAt` for the cohort — resolved by
`getActiveReviewStageForCohort`, the same stage-resolution logic
`reviewService.createReview` already uses to find "the" application-
review stage. "Overdue" means an application with at least one reviewer
still short of `SUBMITTED`, past that date.

### The `COMPLETED`-status fix

An early version of `loadMonitoringDataset` queried assignments with a
status list that excluded `COMPLETED`. Since a fully-submitted, non-
diverging review pair moves its assignments to `COMPLETED`
(`assignmentService.checkAndHandleEscalation`, Phase 3B), such
applications disappeared from this table entirely instead of showing as
`SUBMITTED`. Fixed by widening the status filter
(`ASSIGNED_OR_COMPLETED_STATUSES`) for this "is the application assigned
at all" query specifically — see ADR-0011 for the full before/after and
which other queries needed the same fix (the dashboard's "applications
assigned" count, the application detail page's "assigned reviewers"
list).

## Third-Review Monitoring

`/review-operations/escalations`
(`modules/reviewOperations/services/escalationMonitoringService.ts`)
lists every `ReviewEscalation` row for the cohort: the two original
reviewers' scores, the divergence (`scoreDifference`), the threshold
that was actually applied at the time
(`thresholdApplied` — the historical stored value, not the current
setting, so a later threshold change doesn't retroactively relabel past
escalations), the third reviewer's assignment/completion status, and
`resolvedFinalScore`.

Per the brief's "use the dedicated aggregation service; do not
recalculate formulas in the UI," this reads `ReviewEscalation` exactly
as Phase 3B's `assignmentService.checkAndHandleEscalation` computed and
stored it. It does **not** call the separate, never-built Sequence-3
`ScoreAggregationService`/`ApplicationScore` population — that remains
explicitly out of scope, as it was in Phase 3B; this module reuses the
one aggregation Phase 3B actually built (the escalation-resolution
formula), not a different one.

This information is never exposed to reviewers — `review_escalations
.view` is granted only within `PROGRAMME_OVERSIGHT` and
`PROGRAMME_SECRETARY`, never `APPLICATION_REVIEWER`.

## Conflicts & Recusals queue

`/review-operations/conflicts`
(`modules/reviewOperations/services/conflictQueueService.ts`) is a
read-only merge of two distinct, pre-existing mechanisms:

- **Pre-assignment exclusions** — `ReviewConflictOfInterest` rows,
  recorded via `declareConflictAction` on the application detail page,
  which calls straight through to Phase 3B's
  `assignmentService.declareConflictOfInterest`.
- **Post-assignment recusals** — `Review.status = "RECUSED"`, schema-
  supported since Phase 3A but with **no mutation anywhere in this
  codebase that sets it**. This phase does not add one: neither the
  brief's Secretariat Access Rules nor its suggested permission list
  authorise the Secretariat to recuse a reviewer directly (only to
  "manage conflicts," which maps to the pre-assignment exclusion above).
  The queue honestly reflects that this state is schema-ready but has no
  trigger yet, rather than inventing a "recuse this reviewer" action the
  brief never asked for.

## Testing

`tests/integration/reviewOperations.test.ts` covers: correct dashboard/
monitoring totals against a known fixture (including the post-fix
`COMPLETED` case), programme/cohort isolation, the conflict queue
showing an admin-recorded conflict, third-review monitoring showing the
correct scores/divergence/resolved final score (`70` = average of
`min(90, 60) = 60` and `80`, matching Phase 3B's divergence-clamping
rule exactly), pagination and every filter. `tests/e2e/reviewOperations
.spec.ts` additionally confirms the table, workload, escalations, and
conflicts pages all render correctly in a real browser at both desktop
and mobile viewports.
