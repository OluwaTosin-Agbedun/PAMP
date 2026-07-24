# Phase 3B Implementation Report — Review Assignment Engine and Blind Review Orchestration

## 1. Executive summary

Phase 3B built the reusable review assignment engine on top of Phase
3A's domain layer: automatic first/second-reviewer assignment with
workload balancing, reviewer capacity, and conflict-of-interest
awareness; a full `AssignmentStatus` lifecycle for `ReviewAssignment`
mirroring `Review`'s `ReviewStatus`; authorised manual assignment,
acceptance, cancellation, and reassignment (the last preserving full
history rather than overwriting); and an automatic third-review
escalation engine triggered by a configurable percentage-point score
divergence, with the resolution formula from §2 of the brief. No UI
shipped — Reviewer Workspace, Secretariat Workspace, Interview,
Committee, Executive Approval, Admissions, and notifications are all out
of scope per §18, unchanged from the brief's explicit boundary.
Everything lives in `modules/reviews/{domain,repositories,services,
validation}`, calling into the same permission/audit/error
infrastructure Phase 2 and Phase 3A already established.

Sequence 1's original `modules/reviews/assignment.ts` (a single-function
`autoAssignReviewers`) was refactored into the full engine rather than
left standalone — its exact balancing algorithm was extracted into
`modules/reviews/domain/workloadBalancing.ts` and reused unchanged (see
[ADR-0007](adr/ADR-0007-review-assignment-algorithm.md)), and its one
call site (`modules/eligibility/service.ts`) now imports from
`modules/reviews/services/assignmentService.ts`.

## 2. Files created and modified

### Created

- **Domain engine**: `modules/reviews/domain/{assignmentLifecycle,
  workloadBalancing,reviewerEligibility,thirdReviewEngine}.ts`
- **Repositories**: `modules/reviews/repositories/{assignmentRepository,
  reviewerCapacityRepository,conflictOfInterestRepository,
  escalationRepository}.ts`
- **Services**: `modules/reviews/services/assignmentService.ts`
- **Validation**: `modules/reviews/validation/assignmentSchemas.ts` (Zod)
- **Settings**: `lib/settings/service.ts` (typed `SystemSetting`
  accessors — the first module to actually read from that table)
- **Migration**: `prisma/migrations/20260719150000_phase3b_review_assignment_engine/migration.sql`
- **Tests**: `tests/unit/{assignmentLifecycle,workloadBalancing,
  reviewerEligibility,thirdReviewEngine}.test.ts`,
  `tests/integration/reviewAssignmentEngine.test.ts`
- **Docs**: this file, plus `docs/{REVIEW_ASSIGNMENT_ENGINE,
  BLIND_REVIEW,THIRD_REVIEW_ENGINE,REVIEWER_WORKLOAD}.md`,
  `docs/adr/ADR-0007-review-assignment-algorithm.md`,
  `docs/adr/ADR-0008-third-review-divergence-and-reassignment-history.md`

### Modified

- `prisma/schema.prisma` — see §3.
- `lib/errors/{AppError,index}.ts` — `InvalidReviewTransitionError`
  renamed to `InvalidStatusTransitionError` (now shared by both
  lifecycles); 7 new domain error classes (`ConflictOfInterestError`,
  `ReviewerAtCapacityError`, `ReviewerUnavailableError`,
  `NoEligibleReviewersError`, `SelfAssignmentError`,
  `DuplicateAssignmentError`, `ThirdReviewAlreadyExistsError`).
- `lib/permissions/{catalog,rolePermissions}.ts` — 7 new permissions
  (§10/§11 of the brief; see §5 below).
- `lib/audit/actions.ts` — 6 new audit actions; `REVIEW_ASSIGNED` and
  `REVIEW_THIRD_REVIEWER_ASSIGNED` (Sequence 1) reused, not duplicated.
- `modules/reviews/services/reviewService.ts` — `submitReview` now calls
  `onReviewSubmitted` after its own transaction commits (§6 below).
- `modules/eligibility/service.ts` — import path updated to the new
  `assignmentService` location.
- `modules/reviews/domain/lifecycle.ts`,
  `tests/unit/reviewLifecycle.test.ts` — updated for the
  `InvalidStatusTransitionError` rename.
- `tests/helpers/reviewFixtures.ts` — `cleanupReviewFixtures` now also
  clears `ReviewerCapacity` rows (not reachable via the `Application`
  cascade, since it's keyed by `(reviewerId, programmeId)`, not
  `applicationId`).
- `docs/{database,architecture,RBAC}.md` — updated to reflect the above.

### Removed

- `modules/reviews/assignment.ts` — refactored into
  `modules/reviews/services/assignmentService.ts` (see §1).

Nothing under `app/`, `components/`, or `proxy.ts` changed — no route,
page, Server Action, or UI component was added or touched, per §3/§18's
explicit scope boundary.

## 3. Schema changes

One migration:
`prisma/migrations/20260719150000_phase3b_review_assignment_engine/`.

| Change | Why |
|---|---|
| New enum `AssignmentStatus` | The assignment lifecycle (§5 of the assignment engine brief) — see [`docs/REVIEW_ASSIGNMENT_ENGINE.md`](REVIEW_ASSIGNMENT_ENGINE.md#assignment-lifecycle). |
| New enum `ConflictSource` | `SELF_DECLARED` vs. `ADMIN_RECORDED` (§7). |
| `ReviewAssignment`: dropped `@@unique([applicationId, slot])`, added a partial unique index instead | Reassignment history preservation — see [ADR-0008](adr/ADR-0008-third-review-divergence-and-reassignment-history.md). |
| `ReviewAssignment`: added `assignedById`, `status`, `acceptedAt`, `cancelledAt`/`cancelledById`/`cancelReason`, `reassignedFromId`/`reassignedAt`/`reassignedById`/`reassignReason` | The full lifecycle and reassignment-history fields (§5/§10). |
| New model `ReviewerCapacity` | Per-reviewer, per-programme max concurrent load and availability (§11). |
| New model `ReviewConflictOfInterest` | Pre-assignment exclusion, distinct from `Review.conflictOfInterest` (a post-assignment recusal flag) — see §14 below. |
| New model `ReviewEscalation` | One row per detected divergence, linking to the auto-assigned `THIRD` `ReviewAssignment` and the resolved final score (§9). |

Applied via `prisma migrate deploy` against the real dev database, which
already had 8 production-shaped `ReviewAssignment` rows from Sequence
1's live auto-assignment — verified before writing the migration that
`status DEFAULT 'ASSIGNED'` is the objectively correct backfill value
for all 8, and confirmed after applying that the partial unique index,
its `WHERE` clause, and the backfilled rows are all correct via direct
`psql` queries (the pg_trgm indexes from earlier migrations were also
re-verified intact, since Prisma's diff tool false-flags them for
DROP/CREATE on every migration in this environment — the same
known-and-handled quirk from every prior phase's migration).

## 4. Assignment model — reuse over rebuild

Per the brief's explicit instruction to "review the existing schema
first... reuse where equivalent... make only the minimal changes
needed": `ReviewAssignment` (routing) and `Review` (scoring) stayed two
separate tables, unchanged in that split — Phase 3A had already
established exactly the separation Phase 3B's brief asks for
(`docs/database.md`'s "Routing vs. scoring" section, written in Phase
3A, describes precisely this). The only structural change was extending
`ReviewAssignment` with a status lifecycle and reassignment-history
fields — no new "assignment" concept was introduced alongside the
existing one.

## 5. Permissions (§10/§11)

7 new permissions: `assignments.view`, `assignments.reassign`,
`assignments.cancel`, `conflicts.declare`, `conflicts.manage`,
`reviewer_capacity.view`, `reviewer_capacity.manage`. Full role-matrix
rationale in [`docs/RBAC.md`](RBAC.md#role--permission-matrix) — notably,
`PROGRAMME_SECRETARY` gets the monitoring/correction permissions
(`assignments.{view,reassign,cancel}`) but not `reviews.assign` itself,
which stays a `PROGRAMME_DIRECTOR`/`SYSTEM_ADMIN` action unchanged from
Sequence 1; and `REVIEWER` gets only `conflicts.declare`, deliberately
not `assignments.view` (own-assignment visibility is scoping, not a
permission — see §7 below).

## 6. Hooking into Phase 3A's review submission (§9)

`reviewService.submitReview` (Phase 3A) now calls
`assignmentService.onReviewSubmitted(review.id)` as its last step, after
its own transaction has committed — the identical "primary transaction,
then a follow-up side-effect" sequencing Sequence 1 already established
for `runEligibilityForApplication` → `autoAssignReviewers`. This syncs
the submitting assignment's status to `SUBMITTED` and either checks for
third-review escalation (`FIRST`/`SECOND`) or resolves one (`THIRD`) —
see [`docs/THIRD_REVIEW_ENGINE.md`](THIRD_REVIEW_ENGINE.md). This was the
one required change to an earlier phase's implementation; it's a single
new call at a single call site, not a duplicated copy of submission
logic inside the assignment engine.

## 7. Blind review enforcement (§8)

Server-side query scoping only, never client-side filtering — full
detail in [`docs/BLIND_REVIEW.md`](BLIND_REVIEW.md). The concrete
addition this phase: `assignmentRepository.listActiveAssignmentsForReviewer`
scopes by `reviewerId` in the `WHERE` clause itself, and
`assignmentService.listMyAssignments(actorId)` takes no reviewer-id
parameter at all — there is no argument a caller could pass to see
someone else's assignments, by construction.

## 8. Testing

53 new unit tests (`tests/unit/{assignmentLifecycle,workloadBalancing,
reviewerEligibility,thirdReviewEngine}.test.ts`) covering the pure
domain logic in isolation, plus 27 new integration tests
(`tests/integration/reviewAssignmentEngine.test.ts`) against real
Postgres, covering every item in §15 of the brief: equal distribution,
capacity enforcement, conflict detection, blind review, third-review
assignment and resolution, reassignment (including history preservation
and a submitted assignment's immunity to reassignment), duplicate
prevention, concurrent assignment/reassignment (via real
`Promise.allSettled` races against Postgres, the same technique Phase
3A's concurrent-submission test already used), transaction integrity
(the partial unique index rejecting a concurrent double-assignment),
audit generation, and permission enforcement.

**A real test-isolation issue was found and fixed while writing these
tests**: the assignment engine's candidate pool is genuinely global by
design (`Role.REVIEWER` is a system-wide role, not programme-scoped —
unlike `ReviewerCapacity`, which is per-programme), and this shared dev
Postgres instance has real seeded Reviewer accounts from Sequence 1
(`reviewer.one@pam-p.org`, `reviewer.two@pam-p.org`, both `ACTIVE`). Every
"exactly N eligible reviewers" test was initially polluted by these real
accounts — an "only one eligible reviewer" test saw two, an "escalation
with no eligible third reviewer" test found one. Fixed with a
`beforeAll`/`afterAll` in the new test file that snapshots and
temporarily deactivates any non-test-domain `REVIEWER` account for the
suite's duration, restoring the original status afterward — the same
kind of test-data isolation a dedicated test Programme already provides
for framework/application data, applied to the one entity
(`User.role`) that isn't programme-scoped.

Full suite after this phase's changes: **233 tests passing across 20
files** (`npx vitest run`), including all pre-existing Phase 0/Sequence
1/Phase 2/Phase 3A tests, unaffected by this phase's changes.

## 9. Architecture Decision Records

- [ADR-0007](adr/ADR-0007-review-assignment-algorithm.md) — reusing
  Sequence 1's shuffle-then-sort balancing algorithm rather than
  designing a new one, and renaming (not duplicating) the transition-error
  class for the new assignment lifecycle.
- [ADR-0008](adr/ADR-0008-third-review-divergence-and-reassignment-history.md)
  — the percentage-point (not raw-point) divergence threshold, and the
  partial-unique-index approach to reassignment history.

## 10. Known limitations / deliberately out of scope

- **No Reviewer/Secretariat-facing UI** (§18) — `assignmentService.ts` is
  the exact boundary Phase 3C/3D build against.
- **`unavailableUntil` is not auto-enforced.** `ReviewerCapacity.unavailableUntil`
  is stored but doesn't automatically flip `isAvailable` back on when it
  passes — a Programme Secretary sets `isAvailable` explicitly. Automatic
  expiry would need a scheduled job, out of scope per §18's calendar/
  notification exclusions.
- **No retroactive conflict cascade.** Declaring a conflict of interest
  excludes a reviewer from *future* selection; it does not automatically
  cancel or reassign an assignment that already exists. This is a
  deliberate decision (documented in
  [`docs/REVIEW_ASSIGNMENT_ENGINE.md`](REVIEW_ASSIGNMENT_ENGINE.md#conflict-of-interest)),
  not an oversight — the two actions have independent audit trails and
  independent authorisation requirements.
- **Self-assignment exclusion is currently unreachable in production.**
  `filterEligibleReviewers`'s `SELF_ASSIGNMENT` rule (§2: "no reviewer
  may assign work to themselves") only manifests when the actor
  triggering assignment is *also* a candidate in the `Role.REVIEWER`
  pool — under the current role matrix, `reviews.assign` is granted only
  to `PROGRAMME_DIRECTOR`/`SYSTEM_ADMIN`, neither of which is
  `Role.REVIEWER`, so no real account can currently trigger this path.
  The rule is still fully implemented and unit-tested
  (`tests/unit/reviewerEligibility.test.ts`) for correctness and for the
  moment a future role or permission grant makes it reachable.

## 11. Verification

- `npx tsc --noEmit` — clean.
- `npx eslint` (full repo) — clean.
- `npx vitest run` — 233/233 passing, 20 files.
- `npx next build` — compiles, typechecks, and generates all routes
  successfully.
- `npx prisma migrate status` — up to date, no drift.

## 12. Acceptance criteria (§2/§6–§11 of the brief)

- [x] Every eligible application is assigned to exactly two reviewers automatically.
- [x] Workload is balanced across reviewers (least-loaded selection, capacity-aware).
- [x] A reviewer is never assigned to the same application twice.
- [x] Blind review is enforced server-side, not via client-side filtering.
- [x] Conflicts of interest (self-declared and admin-recorded) exclude a reviewer from future selection.
- [x] Divergence beyond a configurable threshold automatically triggers a third review.
- [x] The final score after a third review follows the brief's exact formula.
- [x] A third reviewer is not shown that they're resolving a disagreement.
- [x] Manual reassignment is authorised, requires a reason, and preserves history without overwriting.
- [x] No reviewer can assign work to themselves.
- [x] All thresholds (divergence percentage, default capacity) are configurable via `SystemSetting`.
- [x] Every mutating action is permission-gated and audited.
- [x] All mutations are transactional; concurrent operations fail safely rather than corrupting state.
- [x] Analytics queries exist for active/completed assignments, turnaround, and escalation rate (no UI).

## 13. What's next

Per the standing process instruction, this phase stops here for review
before Phase 3C begins — see the closing message accompanying this
report.
