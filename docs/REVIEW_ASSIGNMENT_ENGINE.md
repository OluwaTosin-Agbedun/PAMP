# Review Assignment Engine

Phase 3B. Everything that decides *who* reviews *what*: automatic
first/second-reviewer assignment, manual assignment, acceptance,
cancellation, authorised reassignment with history, and the analytics
queries built on top. See [`docs/BLIND_REVIEW.md`](BLIND_REVIEW.md) for
independence/blindness enforcement and
[`docs/THIRD_REVIEW_ENGINE.md`](THIRD_REVIEW_ENGINE.md) for what happens
when two reviewers diverge.

All of this lives in `modules/reviews/{domain,repositories,services}` —
no route, Server Action, or UI shipped this phase (§3/§18 of the brief);
`modules/reviews/services/assignmentService.ts` is the exact boundary a
future Reviewer Workspace (Phase 3C) or Secretariat Workspace (Phase 3D)
calls into.

## Business rules (§2 of the brief, verbatim, and where each is enforced)

| Rule | Enforced by |
|---|---|
| Every eligible application is initially assigned to two reviewers | `autoAssignReviewers` always requests `count: 2` |
| Reviewers must not see each other's scores or comments until the review cycle is complete | Server-side query scoping — see `docs/BLIND_REVIEW.md` |
| Applications must be distributed as evenly as possible across reviewers | `modules/reviews/domain/workloadBalancing.ts` — see `docs/REVIEWER_WORKLOAD.md` |
| A reviewer must never review the same application twice | `reviewerEligibility.ts`'s `ALREADY_ASSIGNED_TO_APPLICATION` exclusion, checked against **active** assignments only (a reassigned-away row doesn't block the reviewer who replaced it, but does still block the *original* reviewer from being re-added) |
| Reviewer assignments must be auditable | Every mutating function writes an `AuditLog` row (`lib/audit/actions.ts`'s Phase 3B block) before returning |
| Score divergence beyond the configured threshold triggers a third reviewer | `checkAndHandleEscalation` — see `docs/THIRD_REVIEW_ENGINE.md` |
| Final score = average of R3's score and the lower of R1/R2 | `calculateFinalScoreAfterThirdReview` — see `docs/THIRD_REVIEW_ENGINE.md` |
| Third reviewers must not know they're resolving a disagreement (absent explicit policy) | Nothing in the `THIRD` assignment, the review-creation flow, or `listMyAssignments` reveals that context; V1.0 declares no policy requiring otherwise |
| The Programme Secretary may manually reassign, with an audit trail | `reassignAssignment`, gated on `assignments.reassign` (granted to `PROGRAMME_SECRETARY`) |
| No reviewer may assign work to themselves | `filterEligibleReviewers`'s `requestingActorId` check (`SELF_ASSIGNMENT`) |
| All thresholds must be configurable | `lib/settings/service.ts`, backed by `SystemSetting` |

## Assignment lifecycle

`AssignmentStatus`: `PENDING`, `ASSIGNED`, `ACCEPTED`, `IN_PROGRESS`,
`SUBMITTED`, `ESCALATED`, `REASSIGNED`, `CANCELLED`, `COMPLETED`.

```
PENDING ──▶ ASSIGNED ──▶ ACCEPTED ──▶ IN_PROGRESS ──▶ SUBMITTED ──▶ ESCALATED ──▶ COMPLETED
              │              │              │              │
              ├─▶ SUBMITTED  ├─▶ SUBMITTED  ├─▶ SUBMITTED  └─▶ COMPLETED (no divergence)
              │              │              │
              ├─▶ CANCELLED  ├─▶ CANCELLED  ├─▶ CANCELLED
              └─▶ REASSIGNED └─▶ REASSIGNED └─▶ REASSIGNED
```

`modules/reviews/domain/assignmentLifecycle.ts`'s `ASSIGNMENT_TRANSITIONS`
is the *only* place this graph is defined — the same "one authoritative
transition table" pattern as the Review lifecycle
([`docs/REVIEW_LIFECYCLE.md`](REVIEW_LIFECYCLE.md)), reused rather than
duplicated: `InvalidReviewTransitionError` was renamed to the
entity-agnostic `InvalidStatusTransitionError` so both lifecycles throw
the same typed error (see ADR-0007). `REASSIGNED`, `CANCELLED`, and
`COMPLETED` are terminal. `PENDING` is reserved for a future
notification-gated flow — no code path produces it this phase, since
every assignment is created with a reviewer already chosen.
`SUBMITTED → ESCALATED` only happens when both reviewers in a pair have
submitted and their scores diverge past the threshold; a non-divergent
pair goes `SUBMITTED → COMPLETED` directly.

`onReviewSubmitted` (called from `reviewService.submitReview`'s success
path, *after* that function's own transaction commits — the same
"primary transaction, then follow-up side-effect" sequencing Sequence 1
already established for eligibility → auto-assignment) syncs the
assignment's status to `SUBMITTED` and then checks for escalation
(`FIRST`/`SECOND`) or resolves one (`THIRD`).

## Reviewer eligibility

`modules/reviews/domain/reviewerEligibility.ts`'s `filterEligibleReviewers`
is the single place every "can this reviewer receive this assignment"
rule is checked — a pure function over an already-loaded snapshot, reused
identically by automatic assignment, manual assignment, reassignment, and
third-review selection (no second copy of these rules for any one path).
Checked in order, first match wins:

1. `SELF_ASSIGNMENT` — the requesting actor can't assign to themselves.
2. `INACTIVE_ACCOUNT` — `User.status !== "ACTIVE"`.
3. `UNAVAILABLE` — `ReviewerCapacity.isAvailable === false` (defaults to available if no capacity row exists).
4. `AT_CAPACITY` — active assignment count ≥ `maxConcurrentAssignments`.
5. `CONFLICT_OF_INTEREST` — an unexpired `ReviewConflictOfInterest` row for this reviewer/application.
6. `ALREADY_ASSIGNED_TO_APPLICATION` — an active assignment already exists for this reviewer on this application.

Each exclusion reason maps to a specific typed error at the service
boundary (`SelfAssignmentError`, `ReviewerUnavailableError`,
`ReviewerAtCapacityError`, `ConflictOfInterestError`,
`DuplicateAssignmentError`) — a caller gets back exactly *why* a manual
assignment was rejected, not a generic failure.

## Manual assignment, acceptance, cancellation, reassignment

| Action | Permission | Notes |
|---|---|---|
| `manualAssignReviewer` | `reviews.assign` | Same permission Sequence 1 already used for automatic assignment (kept, not duplicated) — granted to `PROGRAMME_DIRECTOR`/`SYSTEM_ADMIN`, not `PROGRAMME_SECRETARY` (unchanged from the pre-existing role matrix). |
| `acceptAssignment` | none beyond ownership | A reviewer accepting their own `ASSIGNED`/`ACCEPTED`-eligible row — `AuthorisationError` if it belongs to someone else. |
| `cancelAssignment` | `assignments.cancel` | Requires a reason; the row moves to `CANCELLED`, never deleted. |
| `reassignAssignment` | `assignments.reassign` | See below. |

**Reassignment preserves history rather than overwriting it** (§10: "no
silent overwrite... preserve original reviewer, timestamps, and status").
The old `ReviewAssignment` row transitions to `REASSIGNED` — its
`reviewerId`, `assignedAt`, and prior status are never touched — and a
**new** row is created for the replacement reviewer, linked back via
`reassignedFromId`. This is why `ReviewAssignment` has no
`@@unique([applicationId, slot])`: a partial unique index
(`WHERE status NOT IN ('REASSIGNED', 'CANCELLED')`) allows old and new
rows to coexist for the same slot as long as at most one is active. See
ADR-0008 for the full reasoning and the alternative considered
(mutating the row in place).

Reassignment is itself an assignment-lifecycle transition
(`ASSIGNED/ACCEPTED/IN_PROGRESS → REASSIGNED`), so a `SUBMITTED` or
`ESCALATED` assignment cannot be reassigned —
`InvalidStatusTransitionError` — matching the intuition that a review
already turned in shouldn't be silently handed to someone else.

## Reviewer capacity

`ReviewerCapacity` — one row per `(reviewerId, programmeId)`:
`maxConcurrentAssignments` (default from the configurable
`review.reviewer_default_max_concurrent_assignments` setting, currently
10, when no row exists), `isAvailable`, `unavailableReason`,
`unavailableUntil`. `setReviewerCapacity` (`reviewer_capacity.manage`)
upserts and audits with a `{ before, after }` metadata pair. See
[`docs/REVIEWER_WORKLOAD.md`](REVIEWER_WORKLOAD.md) for how capacity
feeds the balancing algorithm.

`programmeId` is required, not nullable — V1.0 has exactly one programme,
and a nullable "applies to all programmes" wildcard would introduce
NULL-uniqueness footguns in the `@@unique([reviewerId, programmeId])`
constraint for no current benefit. Extending to multiple programmes later
is additive: one capacity row per programme a reviewer serves.

## Conflict of interest

`ReviewConflictOfInterest` — `(reviewerId, applicationId)` unique,
`source: SELF_DECLARED | ADMIN_RECORDED`, optional `expiresAt` (null =
permanent). `declareConflictOfInterest` derives the source from whether
the actor matches the reviewer being declared for — a reviewer declaring
their own conflict needs `conflicts.declare`; anyone declaring on another
reviewer's behalf needs the more privileged `conflicts.manage`.

This excludes the reviewer from **future** assignment selection only — it
does not retroactively cancel an assignment that already exists. That's
a deliberate, separate decision: a Programme Secretary who discovers a
conflict on an already-assigned reviewer calls `cancelAssignment` or
`reassignAssignment` explicitly, with its own reason and audit trail,
rather than a conflict declaration silently cascading into an assignment
change.

## Analytics

`getAssignmentAnalytics(actorId, programmeId)` — `assignments.view`.
Returns active/completed assignment counts, escalation count and rate
(`escalationCount / completedAssignments`), average turnaround
(`review.submittedAt - assignment.assignedAt`, averaged in hours), and
reviewer/unavailable-reviewer counts. No dashboard UI ships this phase
(§18) — this is the query layer a future one calls.

## Audit actions (Phase 3B additions to `lib/audit/actions.ts`)

`ASSIGNMENT_ACCEPTED`, `ASSIGNMENT_REASSIGNED`, `ASSIGNMENT_CANCELLED`,
`CONFLICT_OF_INTEREST_DECLARED`, `REVIEW_ESCALATION_TRIGGERED` (used for
both the trigger and the later resolution, distinguished by an
`outcome: "TRIGGERED" | "RESOLVED"` metadata field — the same
"outcome" pattern Sequence 1 already used for `REVIEW_ASSIGNED`'s
`ASSIGNED`/`SKIPPED` outcomes), `REVIEWER_CAPACITY_CHANGED`.
`REVIEW_ASSIGNED` and `REVIEW_THIRD_REVIEWER_ASSIGNED` are Sequence 1
actions, reused rather than duplicated.

## Permissions (Phase 3B additions to `lib/permissions/catalog.ts`)

`assignments.view`, `assignments.reassign`, `assignments.cancel`,
`conflicts.declare`, `conflicts.manage`, `reviewer_capacity.view`,
`reviewer_capacity.manage` — see
[`docs/RBAC.md`](RBAC.md#role--permission-matrix) for the full role
matrix.
