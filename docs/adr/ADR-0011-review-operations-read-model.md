# ADR-0011: A Separate Oversight-Shaped Read Model for Review Operations

**Status**: Accepted (Phase 3D)

## Context

Phase 3D needed to give the Programme Secretariat a monitoring view over
the entire application-review stage: one row per application, joined
across its assignments, conflicts, and escalation — filterable,
paginated, exportable. Phase 3B already built
`modules/reviews/repositories/assignmentRepository.ts`, but that module
is shaped for the assignment *engine*: queries scoped to a single
reviewer (`listActiveAssignmentsForReviewer`) or a single application
during an assignment decision (`listActiveAssignmentsForApplication`
used by capacity/conflict checks), never a broad, cross-reviewer,
cross-application listing.

## Decision

Build `modules/reviewOperations/` as a new, separate module tree —
`repositories/`, `services/`, `types.ts`, `validation/` — rather than
extending `modules/reviews/`. It reads the same underlying tables
(`ReviewAssignment`, `Review`, `ReviewConflictOfInterest`,
`ReviewEscalation`) but every query in it is oversight-shaped: broad,
joined, gated by `review_operations.view`/`assignments.view` and never
narrowed by `reviewerId`. It calls into Phase 3B's
`assignmentService.{reassignAssignment, declareConflictOfInterest,
setReviewerCapacity}` directly for every mutation ("Use the Phase 3B
reassignment engine" — the brief's own instruction) rather than
reimplementing reassignment/conflict logic; it never writes to
`ReviewAssignment`/`Review` itself.

### Pagination strategy

`assignmentMonitoringRepository.loadMonitoringDataset` loads every
eligible application in the cohort (optionally narrowed by pathway) in a
handful of flat `findMany` calls, then `assignmentMonitoringService`
groups rows by application, applies the remaining filters (reviewer,
status, overdue, conflict, third-review, assigned-date range), and
paginates in JS. This is not a two-phase SQL `LIMIT`/`OFFSET` join.
Justified by this system's documented scale — a few hundred applications
per cohort, the same order of magnitude Sequence 1's applicant import
already assumes (see its "600 rows" precedent in
`docs/architecture.md`) — where loading a full cohort and filtering in
memory is simple, correct, and fast enough, and a streaming/paginated-SQL
version would be premature complexity for a scale this system doesn't
have.

### "Assigned or completed" vs "currently active" status sets

Two different status-set constants are used depending on the query's
purpose:

- **Table-inclusion / "is this application assigned at all"** queries
  (`assignmentMonitoringRepository`'s `ASSIGNED_OR_COMPLETED_STATUSES`,
  `dashboardRepository`'s `ASSIGNED_STATUSES`,
  `applicationDetailRepository`'s `ACTIVE_STATUSES`) use every
  `AssignmentStatus` except `REASSIGNED` (superseded by the row that
  replaced it) and `CANCELLED` (truly unassigned) — deliberately
  *including* `COMPLETED`.
- **Load / utilisation / completion-percentage-denominator** figures
  (`workloadRepository`, the "reviews in progress" style dashboard
  counts) use the narrower, genuinely-still-open set that excludes
  `COMPLETED`.

This distinction exists because a fully-submitted, non-diverging review
pair moves its assignments to `COMPLETED`
(`assignmentService.checkAndHandleEscalation`, Phase 3B). Using the
narrow "active" set everywhere — the first version of this code did —
made such applications silently vanish from the Assignment Monitoring
table and undercounted "applications assigned" on the dashboard, caught
by `tests/integration/reviewOperations.test.ts`'s dashboard-totals test.
The fix keeps the narrow set exactly where excluding `COMPLETED` is
correct (workload/completion-percentage math) while broadening it
specifically for "does this application show up in the list" queries.

### "Due date" and "assignment batch"

Neither concept exists in the schema. "Due date" is resolved by reusing
`ReviewStage.closesAt` for whichever stage
`getActiveReviewStageForCohort` resolves as "the" active application-
review stage — the same stage-lookup `reviewService.createReview`
already performs, not a new field. "Assignment batch" (a filter the
brief lists) has no batch-identifier concept in this schema — auto-
assignment runs per application, not in tracked batches — so it's
interpreted pragmatically as an assigned-date range filter
(`assignedFrom`/`assignedTo`). Both are deliberate, non-inventive
interpretations of an underspecified brief term, not new schema.

## Alternatives considered

**Add the monitoring queries directly to
`modules/reviews/repositories/assignmentRepository.ts`.** Rejected — it
would mix two different access shapes (reviewer-scoped engine queries,
unscoped oversight queries) in one file, making it easy to accidentally
reuse a reviewer-scoped query for an oversight page (or vice versa) and
leak or hide data across the blind-review boundary.

**Two-phase SQL pagination (`COUNT(*)` + `LIMIT`/`OFFSET` join) from the
start.** Rejected as premature for this system's scale; documented here
as the natural next step if a cohort ever approaches a size where
in-memory filtering becomes the bottleneck.

## Consequences

- Every Phase 3D read is provably read-only with respect to the
  assignment engine's own tables — no new write path was added outside
  the notes module and calls into Phase 3B's existing services.
- The `ASSIGNED_OR_COMPLETED_STATUSES` vs "active" distinction must be
  kept in mind by anyone adding a new query in this module tree; each
  new repository function's doc comment states which set it uses and
  why.
- Should this system's scale assumption stop holding, the pagination
  strategy is confined to `assignmentMonitoringRepository`/
  `assignmentMonitoringService` — replacing it later doesn't touch the
  UI or the export path.
