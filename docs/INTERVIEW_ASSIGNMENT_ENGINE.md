# Interview Assignment Engine

Release 1, Module 1. Everything that decides *which applicants* get
interviewed and *who sits on the panel*: shortlist generation from review
scores, automatic four-panellist assignment with equal workload
distribution, conflict-of-interest checking, capacity management, and
authorised reassignment with full history preservation — the same
lifecycle Phase 3B's [Review Assignment Engine](REVIEW_ASSIGNMENT_ENGINE.md)
established for reviewers, reused wherever the underlying rule is
identical rather than reimplemented.

All of this lives in `modules/interviews/{domain,repositories,services}`
plus a minimal `modules/scoring/services/scoreAggregationService.ts` (see
below) — no route, Server Action, or UI ships this module; the Interview
Workspace (Module 2) and Interview Operations Workspace (Module 4) call
into `modules/interviews/services/panelAssignmentService.ts` as their
boundary.

## Business rules (Module 1 brief, verbatim, and where each is enforced)

| Rule | Enforced by |
|---|---|
| Assign the Top 70 applicants to interview panels | `generateInterviewShortlist` — see "The shortlist" below |
| Four panellists per applicant | `autoAssignPanel`'s `panelSize` read from the configurable `interview.panellist_count` setting (default 4) |
| Equal workload distribution | `selectLeastLoadedReviewers` (Phase 3B's `modules/reviews/domain/workloadBalancing.ts`), reused directly |
| Conflict-of-interest checking | `InterviewConflictOfInterest` + `filterEligibleReviewers`'s `CONFLICT_OF_INTEREST` exclusion (Phase 3B's `modules/reviews/domain/reviewerEligibility.ts`), reused directly |
| Capacity management | `InterviewerCapacity` + the same eligibility function's `AT_CAPACITY`/`UNAVAILABLE` exclusions |
| Reassignment | `reassignPanelist`, gated on `interview_assignments.manage` |
| Audit logging | Every mutating function writes an `AuditLog` row (`lib/audit/actions.ts`'s "Interview Assignment Engine" block) before returning |
| Complete history preservation | Reassignment/cancellation never delete or mutate a panel seat in place — see "Panel lifecycle" below |
| No schema shortcuts | `InterviewPanelist` was extended to the full reassignment-with-history shape (status, `assignedBy`/`cancelledBy`/`reassignedBy`, `reassignedFromId`) rather than left at its original three-field shape |
| Reuse the existing Assignment Engine architecture wherever appropriate | `filterEligibleReviewers` and `selectLeastLoadedReviewers` are imported unmodified from `modules/reviews/domain/` — no parallel interview-flavoured copy of either exists |

## A necessary prerequisite: minimal review-score aggregation

The brief's literal requirement — "Assign Top 70 applicants" — cannot be
honestly built without *some* ranking of applications by review score
already existing. No `ScoreAggregationService` existed before this
module, even though `docs/database.md` named one as `ApplicationScore`'s
intended sole writer back in Phase 3B.

`modules/scoring/services/scoreAggregationService.ts`'s
`recomputeReviewAverage(applicationId)` is the minimal slice of that
service Module 1 actually needs: it populates
`ApplicationScore.reviewAverage`/`reviewScoreCount` from submitted
reviews only. It does **not** compute `interviewAverage`,
`compositeScore`, `rank`, or `rankingTier` — those remain the Final
Ranking Engine's responsibility (Module 5). It's called unconditionally
from the tail of `modules/reviews/services/assignmentService.ts`'s
`onReviewSubmitted`, so `ApplicationScore.reviewAverage` always reflects
the current review state as soon as a review is submitted.

The formula (see ADR-0015 for the full reasoning, flagged there for
programme-owner confirmation since no document states it explicitly):

- If a `ReviewEscalation` has resolved (`resolvedFinalScore !== null`),
  that value is used verbatim, `reviewScoreCount = 3`.
- Else, if exactly two `FIRST`/`SECOND` reviews are submitted,
  `reviewAverage = average(R1, R2)`, rounded to 2 dp, `reviewScoreCount = 2`.
- Else, `reviewAverage` stays `null` — not enough data to rank yet.

## The shortlist ("Top 70")

`generateInterviewShortlist(actorId, cohortId)` — `interview_assignments.manage`.
Reads every `ApplicationScore` row with a non-null `reviewAverage` in the
cohort, ranked descending, takes the configured
[`ranking.top70Size`](../lib/settings/registry.ts) (default 70, named to
match the key `docs/database.md` already documented as this value's
intended setting name), and records the result as a `RankingSnapshot`
named `"Interview Shortlist"` — the exact generalized, lockable,
point-in-time mechanism `docs/database.md` designed for this purpose,
not a bespoke table. `RankingSnapshot`/`RankingSnapshotEntry` are shared
with the Final Ranking Engine (Module 5), which will produce its own
differently-named, differently-sized snapshot later.

## Panel lifecycle

`PanelistAssignmentStatus`: `ASSIGNED`, `REASSIGNED`, `CANCELLED`.

```
ASSIGNED ──▶ REASSIGNED
   │
   └──▶ CANCELLED
```

`modules/interviews/domain/panelLifecycle.ts`'s `PANELIST_TRANSITIONS` is
the single authoritative transition table — mirrors
`modules/reviews/domain/assignmentLifecycle.ts` exactly, throwing the
same `InvalidStatusTransitionError`. Both terminal states are reachable
only from `ASSIGNED`; neither is reachable from the other, matching the
review-assignment lifecycle's rule that a settled outcome doesn't get a
second transition.

**Reassignment preserves history rather than overwriting it**, the same
rule Phase 3B established for `ReviewAssignment` and ADR-0008 documents
in full. The old `InterviewPanelist` row transitions to `REASSIGNED` —
its `userId`, `assignedAt`, and prior status are never touched — and a
**new** row is created for the replacement panellist, linked back via
`reassignedFromId`. This is why `InterviewPanelist` has no
`@@unique([interviewId, userId])`: a partial unique index
(`interview_panelists_interviewId_userId_active_key`, `WHERE status NOT
IN ('REASSIGNED', 'CANCELLED')`) allows old and new rows to coexist for
the same seat as long as at most one is active — letting a panellist
reassigned off an interview later be reassigned back onto it without
colliding with their own superseded row.

## Panellist eligibility

Every "can this interviewer receive this seat" rule is checked by the
same pure function Phase 3B built for reviewers —
`filterEligibleReviewers` — over an interview-shaped candidate snapshot
built by `buildCandidateSnapshots`/`buildSingleCandidateSnapshot` in
`panelAssignmentService.ts`. Checked in order, first match wins:

1. `SELF_ASSIGNMENT` — the requesting actor can't assign themselves (reassignment path only; `autoAssignPanel` passes `null`, since it has no human actor).
2. `INACTIVE_ACCOUNT` — `User.status !== "ACTIVE"`.
3. `UNAVAILABLE` — `InterviewerCapacity.isAvailable === false` (defaults to available if no capacity row exists).
4. `AT_CAPACITY` — active panel-seat count ≥ `maxConcurrentInterviews`.
5. `CONFLICT_OF_INTEREST` — an `InterviewConflictOfInterest` row for this interviewer/application.
6. `ALREADY_ASSIGNED_TO_APPLICATION` — an active seat already exists for this interviewer on this interview.

`autoAssignPanel` is **idempotent**: an interview that already has active
(`ASSIGNED`) panelists is left untouched on a second call — no error, no
duplicate seats, `{ assigned: false, reason: "ALREADY_ASSIGNED" }`.

When fewer than the configured panel size are eligible, `autoAssignPanel`
does **not** throw — it returns `{ assigned: false, interviewerIds: [] }`
and writes an `INTERVIEW_PANEL_ASSIGNED` audit row with
`outcome: "SKIPPED"`, so a batch shortlist run doesn't abort partway
through because one interview's pool is thin. The manual paths
(`reassignPanelist`) do throw a specific typed error per exclusion reason
(`SelfAssignmentError`, `ValidationError`, `ReviewerUnavailableError`,
`ReviewerAtCapacityError`, `ConflictOfInterestError`,
`DuplicateAssignmentError`, `NoEligibleReviewersError`) — all reused
directly from Phase 3B's error set with interview-appropriate messages,
rather than a parallel `Interviewer*Error` hierarchy.

## Interviewer capacity

`InterviewerCapacity` — one row per `(interviewerId, programmeId)`:
`maxConcurrentInterviews` (default 10 when no row exists), `isAvailable`,
`unavailableReason`, `unavailableUntil`. `setInterviewerCapacity`
(`interview_assignments.manage`) upserts and audits with a
`{ before, after }` metadata pair. Kept as its own model rather than
reusing `ReviewerCapacity` — an interviewer's concurrent-interview limit
is a distinct resource from a reviewer's, even though the shape is
identical.

## Conflict of interest

`InterviewConflictOfInterest` — `(interviewerId, applicationId)` unique,
`source: SELF_DECLARED | ADMIN_RECORDED` (the `ConflictSource` enum is
shared with `ReviewConflictOfInterest`), optional `expiresAt`.
`declareInterviewConflict` derives the source the same way Phase 3B's
`declareConflictOfInterest` does: the actor declaring for themselves
needs `interview_conflicts.declare`; anyone declaring on another
interviewer's behalf needs `interview_conflicts.manage`.

As with the review engine, this excludes the interviewer from **future**
selection only — it does not retroactively cancel an existing seat. A
Secretariat member who discovers a conflict on an already-assigned
panellist calls `cancelPanelist` or `reassignPanelist` explicitly.

## Not built this module

`InterviewPanelist.isChair` (pre-existing schema field) has no
chair-selection action — no requirement text in the Module 1 brief
specifies chair-assignment behaviour, so it's left available but unused
rather than invented. `interviewAverage`/`compositeScore`/`rank`/
`rankingTier` on `ApplicationScore` are Module 5's responsibility, not
this module's.

## Audit actions (Module 1 additions to `lib/audit/actions.ts`)

`INTERVIEW_SHORTLIST_GENERATED`, `INTERVIEW_PANEL_ASSIGNED` (`outcome:
"ASSIGNED" | "SKIPPED"`, the same outcome-metadata pattern Sequence 1
established for `REVIEW_ASSIGNED`), `INTERVIEW_PANELIST_REASSIGNED`,
`INTERVIEW_PANELIST_CANCELLED`, `INTERVIEW_CONFLICT_DECLARED`,
`INTERVIEWER_CAPACITY_CHANGED`. `INTERVIEW_SCHEDULED` already existed
(declared with the original schema, never used until now) and is reused
as-is.

## Permissions (Module 1 additions to `lib/permissions/catalog.ts`)

`interview_assignments.manage`, `interview_conflicts.declare`,
`interview_conflicts.manage`, `interview_operations.view`,
`interview_operations.export` — granted to `PROGRAMME_SECRETARY` (the
primary human operator, the same role that operates the review
assignment engine) and `SYSTEM_ADMIN`; `INTERVIEWER` gets only
`interview_conflicts.declare` (self-declaration) and the pre-existing
`interviews.view`/`interviews.score`. See
[`docs/RBAC.md`](RBAC.md#role--permission-matrix) for the full role
matrix.

## Known limitation flagged for Module 5

`docs/database.md` documents this programme's ranking design with a
`RankingTier` enum of `TOP_70` / `TOP_60` / `RESERVE` / `NOT_RANKED`, and
a correspondingly-named `ranking.top60Size` setting. The Release 1
overnight brief's Module 5 ("Final Ranking Engine") explicitly specifies
**"Top 30 selection"**. This is a genuine, unresolved conflict in final
cohort size (60 vs 30) — not a naming difference — and is out of scope
for Module 1, which only depends on the "Top 70" shortlist number (which
*is* consistent between both sources). It will need a governance decision
before Module 5 can be built; see the Release 1 completion report.
