# Phase 3A Implementation Report — Review Framework and Scoring Engine

## 1. Executive summary

Phase 3A built the reusable domain engine for configuring review
criteria, validating scores, and calculating review totals, independent
of any UI — no Reviewer Workspace, reviewer assignment changes,
interviews, committee review, executive approval, or admissions work
shipped this phase, per the brief's explicit scope boundary. The engine
lives in `modules/reviews/{domain,repositories,services,validation,
types,constants,seed}`, built on a restructured `ReviewStage`/
`ReviewFramework`/`ReviewCriterion`/`RatingScale` schema (one migration,
applied to empty tables — no data migration needed). Scoring uses exact
decimal arithmetic throughout (`Prisma.Decimal`), rounds exactly once,
and is deterministic. The review lifecycle (`NOT_STARTED → IN_PROGRESS
→ SUBMITTED`, plus authorised reopening) is enforced by a single
transition table, with transactional, concurrency-safe submission and
reopening.

The one deliverable this phase could not complete as specified: **the
PAM-P Application Review framework's individual criteria were not
seeded.** No "PAM-P Selection Metrics Framework," "Application Review
Guidelines," or "Interview Guidelines" document exists anywhere in this
repository — confirmed by search before writing any seed code, not
assumed. Per the brief's own §20 instruction, the seed stops at the one
fact stated directly in the brief itself (§4: Application Review's
maximum is 60) and reports exactly what's missing rather than inventing
criteria. See §14 and §20 below.

## 2. Files created and modified

### Created

- **Domain engine**: `modules/reviews/domain/{scoring,validation,
  frameworkValidation,lifecycle}.ts`
- **Repositories**: `modules/reviews/repositories/{frameworkRepository,
  reviewRepository}.ts`
- **Services**: `modules/reviews/services/{frameworkService,
  reviewService}.ts`
- **Validation**: `modules/reviews/validation/schemas.ts` (Zod)
- **Types/constants**: `modules/reviews/types/scoring.ts`,
  `modules/reviews/constants/scoring.ts`
- **Seed**: `modules/reviews/seed/seedApplicationReviewStage.ts`
- **Migration**: `prisma/migrations/20260719120000_phase3a_review_framework/migration.sql`
- **Tests**: `tests/helpers/reviewFixtures.ts`,
  `tests/unit/{reviewScoring,reviewValidation,reviewFrameworkValidation,
  reviewLifecycle}.test.ts`,
  `tests/integration/{reviewFramework,reviewLifecycle,reviewPermissions,
  reviewDataIntegrity}.test.ts`
- **Docs**: this file, plus `docs/{REVIEW_FRAMEWORK,SCORING_ENGINE,
  REVIEW_LIFECYCLE,SCORE_CALCULATION_RULES}.md`

### Modified

- `prisma/schema.prisma` — see §3.
- `prisma/seed.ts` — calls `seedApplicationReviewStage` after the
  existing bootstrap-admin/programme/cohort steps.
- `lib/errors/{AppError,index}.ts` — 10 new domain error classes (§23
  of the brief; see §13 below).
- `lib/permissions/{catalog,rolePermissions}.ts` — 8 new permissions
  (§15/§16 of the brief; see §12 below).
- `lib/audit/actions.ts` — 15 new audit actions (§17 of the brief; see
  §13 below).
- `docs/{database,architecture,RBAC,SEEDING}.md`, `README.md` — updated
  to reflect the above (see the diffs in each file's Phase 3A-labeled
  sections).

Nothing under `app/`, `components/`, or `proxy.ts` changed — no route,
page, Server Action, or UI component was added or touched, consistent
with §3/§24/§29's scope boundary.

## 3. Schema changes

One migration:
`prisma/migrations/20260719120000_phase3a_review_framework/`.

| Change | Why |
|---|---|
| New enums: `ReviewStageStatus`, `ReviewFrameworkStatus`, `ReviewScoringMethod`, `ReviewStatus` | Required for the new models below and the richer review lifecycle (§11 of the brief). `ScoreSubmissionStatus` (the old enum) is kept, unchanged, for `InterviewScore` — Phase 3A doesn't touch the Interview module. |
| New model `ReviewStage` | §7.1 of the brief — a configurable pipeline slot (Application Review, future Interview, future Committee Assessment), programme-required/cohort-optional, with a declared `maxTotalScore`. |
| New model `ReviewFramework` | §7.2 — one versioned rubric implementing a stage. `DRAFT`/`PUBLISHED`/`RETIRED`, never mutated after publish. |
| New models `RatingScale`, `RatingScaleBand` | §7.4 — framework-scoped, optional per-criterion labeled score bands. |
| `ReviewCriterion` restructured | Moved from `cohortId`-scoped to `reviewFrameworkId`-scoped; added `code` (unique per framework), `minScore`, `reviewerGuidance`, `evidenceGuidance`, `isMandatory`, `isCommentMandatory`, `allowDecimalScores`, `ratingScaleId`. `displayOrder` replaces `order` (rename, no semantic change). |
| `Review` restructured | Added `reviewFrameworkId` (pins the exact rubric version scored against), `reopenedAt`/`reopenedById`/`reopenReason`. `status` moved from `ScoreSubmissionStatus` to the new `ReviewStatus` enum. |
| `ReviewScore` | Added `createdAt`/`updatedAt` (useful for future staleness/audit display; the `@@unique([reviewId, criterionId])` constraint was already present and unchanged — it already satisfied §6's "never JSON" and §14's "prevent duplicate score records... through database constraints" requirements before this phase). |

### Why this was reviewed against "do not redesign the database unnecessarily" first

Per §2's mandatory first step, the existing schema was inspected before
any change was written. `ReviewCriterion`/`Review`/`ReviewScore` already
existed from the earlier database-design phase, already satisfied "never
JSON" and "one row per (review, criterion)" — but had no framework/
version/stage concept at all (`ReviewCriterion` was a flat,
cohort-scoped list with no `code`, no min score, no guidance, no
mandatory/decimal-policy flags, no rating scale). This is exactly the
kind of inconsistency §2 asks to be identified, explained, and resolved
with the least disruptive change:

1. **Identified**: the brief's required concepts (versioned framework,
   rating scales, per-criterion guidance/mandatory flags) had no
   equivalent in the approved schema.
2. **Impact**: without them, there's no way to express "this framework
   version is locked once published" or "this criterion requires a
   comment" — core requirements of §7/§8/§12.
3. **Least disruptive implementation**: extend `ReviewCriterion` in
   place (same table, same primary key convention, same
   never-soft-deleted/`isActive`-deactivated pattern already used
   elsewhere) rather than replacing it; add two new small models
   (`ReviewStage`, `ReviewFramework`) rather than folding everything into
   one bloated table; leave every other entity (`ReviewAssignment`,
   `Application`, `InterviewCriterion`, etc.) completely untouched.
4. **Documented**: in `docs/database.md`'s new "Phase 3A update" section
   and in `docs/REVIEW_FRAMEWORK.md`.
5. **No unrelated redesign**: `ReviewAssignment` (routing), the Interview
   module's tables, and everything else in `prisma/schema.prisma`
   outside the review-framework section is byte-for-byte unchanged.

`review_criteria`, `reviews`, and `review_scores` were confirmed empty
(`SELECT COUNT(*)` before writing the migration) — the Reviewer
Workspace was never built, so nothing had ever written to them. This
made the restructuring a clean structural change, not a data migration:
no backfill was needed for the new `NOT NULL` columns
(`reviewFrameworkId` on both `review_criteria` and `reviews`).

## 4. Migration details

`prisma migrate diff --from-config-datasource --to-schema` generated the
raw SQL non-interactively (same pattern established in Phase 2); it was
reviewed, hand-copied into the migration file (excluding nothing this
time — no pg_trgm-style false positive occurred, since this migration
doesn't touch any raw-SQL-created index), and applied via
`prisma migrate deploy`. Verified afterward:

```
$ npx prisma migrate status
Database schema is up to date!
```

The four `pg_trgm` search indexes from the database-design phase were
confirmed still present (`\di applicants_*_trgm_idx`) — this migration's
diff didn't touch them at all, unlike Phase 2's, which had to explicitly
exclude a false-positive `DROP INDEX` for them.

## 5. Review framework architecture

See [`docs/REVIEW_FRAMEWORK.md`](REVIEW_FRAMEWORK.md) for the full
writeup. Summary: `ReviewStage` (a pipeline slot with a declared
maximum) → `ReviewFramework` (one versioned rubric filling that slot,
`DRAFT`/`PUBLISHED`/`RETIRED`) → `ReviewCriterion` (rubric line items,
immutable once published) → optional `RatingScale`/`RatingScaleBand`
(labeled score bands). Publishing a new framework version automatically
retires whichever version was previously published for the same stage —
a service-level rule (`publishReviewFramework`), not a database
constraint, chosen because the brief doesn't specify whether multiple
simultaneously-published versions are allowed and leaving that
ambiguous would make "the active framework for this stage" ill-defined
for review creation.

## 6. Criterion and rating-scale design

Every criterion field the brief's §7.3 lists is present:
name/label, code, description, reviewer guidance, evidence guidance,
display order, min/max score, weight, mandatory flag, comment-mandatory
flag, whole-numbers-only vs. decimals-allowed, active status, framework
association. Codes are unique per framework (not globally — the same
code can recur across a stage's different framework versions, since
each version is its own row with its own criteria).

Rating scales (§7.4) are framework-scoped (not global, not
criterion-owned) so a scale is frozen the same way criteria are once
published, and can in principle be shared across multiple criteria in
the same framework. Not every criterion uses one — `ratingScaleId` is
nullable, for direct score entry within `[minScore, maxScore]` instead.
Publish validation (§7) rejects a scale with zero bands and a band value
outside its criterion's range.

## 7. Framework versioning approach

Plain incrementing integer per stage (`(reviewStageId, version)`
unique), assigned by `getNextFrameworkVersion` at draft-creation time
(max existing version + 1, or 1 if none exist). A framework is never
edited after `PUBLISHED` — `assertFrameworkEditable` (in
`frameworkService.ts`) throws `FrameworkLockedError` for any attempted
criterion/rating-scale change once status leaves `DRAFT`. Immutability
is what makes `Review.reviewFrameworkId` a durable pointer: "the exact
rubric this review was scored against" never changes underneath it, even
after a newer version publishes and the one in use is retired
(`tests/integration/reviewDataIntegrity.test.ts` verifies this
end-to-end).

## 8. Scoring formulas

See [`docs/SCORE_CALCULATION_RULES.md`](SCORE_CALCULATION_RULES.md) for
the full formula reference. In short: `total = round₂(Σ (score_i ×
weight_i))` over every scored, active criterion — one implemented
scoring method (`WEIGHTED_SUM`, covering both weighted and unweighted
scoring, since unweighted is simply every `weight = 1`), dispatched
through a `switch` structured for future extension without a rewrite
(§9's "structure the service so additional methods can be introduced
without rewriting the core review model").

## 9. Decimal and rounding strategy

`Prisma.Decimal` (`decimal.js`) throughout — never native `number`
arithmetic — for exactly the reason §10 calls out: binary floating point
cannot represent values like `0.1` or `1.005` exactly, and an
authoritative total must not depend on which values happen to round
cleanly in base 2. Rounding happens **exactly once**, at the end of
`calculateReviewTotal`, to 2 decimal places with `ROUND_HALF_UP` — every
intermediate value (a criterion's weighted contribution, the running
sum) stays at full `decimal.js` precision, so rounding order never
affects the result. The displayed value and the stored value
(`Review.totalScore`, `Decimal(6,2)`) are therefore always identical —
there is no separate display-rounding step anywhere in this codebase.
Full detail, including the exact halfway-case (`1.005 → 1.01`) test, in
[`docs/SCORE_CALCULATION_RULES.md`](SCORE_CALCULATION_RULES.md).

## 10. Review lifecycle and transition rules

See [`docs/REVIEW_LIFECYCLE.md`](REVIEW_LIFECYCLE.md). Statuses:
`NOT_STARTED`, `IN_PROGRESS`, `SUBMITTED`, `REOPENED`, `RECUSED`,
`CANCELLED`. One transition table
(`modules/reviews/domain/lifecycle.ts`) is the sole authority — every
status-changing service call goes through `assertTransition` first.
`NOT_STARTED → SUBMITTED` is valid directly (a reviewer can fill in
every score and submit without a separate draft-save step first) — this
was a real bug caught by an integration test, not designed in from the
start; see §18 below.

Draft saves allow incompleteness but reject invalid data (out-of-range
scores, wrong-framework criteria, duplicates, decimal-policy
violations) in every mode; submission additionally requires every
mandatory criterion scored, every required comment present, the
framework published, the stage's review-period window open, and the
application still eligible for the stage.

## 11. Locking, reopening and historical-integrity controls

A submitted review's scores, comments, and total cannot be directly
edited — `saveDraftScores`/`removeDraftScore` both reject with
`ReviewAlreadySubmittedError` once `status === "SUBMITTED"`. Reopening
(`review_scores.reopen`, System Administrator only) requires a reason,
is audited with a full snapshot of the prior scores/total/submission
timestamp in the `REVIEW_REOPENED` entry's metadata (not a second copy
of the scores in the schema — the audit trail is this project's one
history mechanism), and moves the review to `REOPENED`, which carries
the same edit rights as `IN_PROGRESS`. Recalculation
(`recalculateReview`) recomputes from the current `ReviewScore` rows and
corrects `Review.totalScore` only when it's actually drifted, auditing
the `from`/`to` values when (and only when) a correction happens.

## 12. Permission additions

Eight new permissions in `lib/permissions/catalog.ts`, taken directly
from the brief's §15 suggested list:
`review_frameworks.{view,create,update,publish,retire}`,
`review_scores.{view,submit,reopen}`. Granted per §16's matrix — full
detail and the one deliberate role-level ("where approved"/"where
authorised" phrases granted at the role level, matching the existing
convention for `admissions.manage` etc.) interpretation in
[`docs/RBAC.md`](RBAC.md#role--permission-matrix). RBAC stayed
code-based, per §15's explicit instruction not to introduce
database-managed dynamic roles this phase.

## 13. Audit implementation

15 new `AUDIT_ACTIONS`: `REVIEW_STAGE_{CREATED,UPDATED}`,
`REVIEW_FRAMEWORK_{CREATED,UPDATED,PUBLISHED,RETIRED}`,
`REVIEW_CRITERION_{CREATED,UPDATED,RETIRED}`, `REVIEW_CREATED`,
`REVIEW_DRAFT_SCORE_SAVED`, `REVIEW_REOPENED`, `REVIEW_RECALCULATED`,
`REVIEW_SCORE_CHANGED_AFTER_REOPEN` (reserved — not yet written to,
since no code path in this phase changes a score *after* a reopen
without going through the same `saveDraftScores`/`submitReview` path
that already audits `REVIEW_DRAFT_SCORE_SAVED`/`REVIEW_SUBMITTED`; kept
for a future phase that might want a more granular per-score-change
record), `REVIEW_ADMINISTRATIVE_OVERRIDE` (reserved — no administrative
override mechanism exists yet, see §19). `REVIEW_SUBMITTED` (existing,
from Sequence 1) is reused rather than duplicated. Every audit-writing
call includes `programmeId`/`cohortId` where derivable, consistent with
the existing convention. 10 new typed error classes in
`lib/errors/AppError.ts` (§23 of the brief):
`InvalidReviewFrameworkError`, `FrameworkNotPublishedError`,
`FrameworkLockedError`, `InvalidScoreError`, `IncompleteReviewError`,
`ReviewAlreadySubmittedError`, `InvalidReviewTransitionError`,
`ReviewPeriodClosedError`, `DuplicateCriterionScoreError` (kept for
consistency with the brief's list, though the same duplicate-detection
result is currently returned as `InvalidScoreError` from
`validateReviewScores`'s `DUPLICATE_CRITERION_SCORE` issue code — no
call site throws `DuplicateCriterionScoreError` directly, since the
database's own unique constraint is the actual final backstop and it
surfaces as a raw Prisma error, translated generically by
`handleActionError` rather than this specific class; flagged as a minor
inconsistency worth resolving if this class turns out to be needed
distinctly), `ReviewConcurrencyError`.

## 14. Seeded PAM-P review framework

**Only the `ReviewStage` was seeded** — `code: "APPLICATION_REVIEW"`,
`maxTotalScore: 60`. Confirmed idempotent (`npm run db:seed` run twice;
second run logs "Application Review stage already exists," zero
duplicate rows). No `ReviewFramework`, `ReviewCriterion`, or
`RatingScale` rows were created. Per §20, this repository was searched
for a "PAM-P Selection Metrics Framework," "Application Review
Guidelines," or "Interview Guidelines" document — by filename pattern
(`*selection*metric*`, `*review*guideline*`, `*interview*guideline*`)
and by file type (`.pdf`, `.docx`) across the entire working tree — and
none exists. The Phase 3A brief itself states exactly one relevant fact
directly (§4: "Application Review: maximum score of 60"); everything
else the seed would need — the actual list of criteria, each one's
maximum/weight within that 60, descriptions, reviewer guidance, whether
any use a rating scale — is not available anywhere in this codebase or
its documentation.

Every run of `npm run db:seed` logs this explicitly:

```
Application Review framework NOT seeded — no approved criteria are available in this repository.
Missing before a framework can be built:
  - The approved list of Application Review criteria (names/codes).
  - Each criterion's maximum score and/or weight within the 60-point total.
  - Each criterion's approved description and reviewer guidance.
  - Whether any criterion uses a rating scale, and if so its bands/labels/anchors.
  - The criteria's approved display order.
```

See §20 below — this is the one item requiring programme-owner input
before it can be completed.

## 15. Unit and integration test results

```
$ npx vitest run
 Test Files  15 passed (15)
      Tests  153 passed (153)
```

62 tests carried over from Phase 2 (unchanged, still passing); 91 new
this phase, split:

| Suite | File | Covers |
|---|---|---|
| Unit | `tests/unit/reviewScoring.test.ts` | `calculateCriterionScore`/`RawScore`/`WeightedScore`/`Total`/`FrameworkMaxScore`, `getReviewScoreBreakdown`; determinism; exact-decimal arithmetic (`0.1 + 0.2 = 0.3`); `ROUND_HALF_UP` on the exact halfway case. |
| Unit | `tests/unit/reviewValidation.test.ts` | `validateCriterionScore` (range, decimal policy, rating-scale match, mode-gated comment requirement); `validateReviewScores` (draft-allows-incomplete, duplicate/unknown/inactive criterion rejection, submit-mode completeness, `allCriteriaMandatory` override, overall-comment requirement). |
| Unit | `tests/unit/reviewFrameworkValidation.test.ts` | Every §8 publish-validation rule individually: not-DRAFT, zero active criteria, duplicate codes, min>max, non-positive max/weight, missing reviewer guidance, missing/out-of-range rating scale, total mismatch, and the valid-framework success path. |
| Unit | `tests/unit/reviewLifecycle.test.ts` | Every valid and invalid transition in the status graph, exhaustively (`it.each`); terminal-state and no-self-transition invariants. |
| Integration (real Postgres) | `tests/integration/reviewFramework.test.ts` | Stage/framework/criterion creation via the service layer; permission denial; publish success (total computed and locked, stage flips to `ACTIVE`); publish rejection (mismatched total, zero criteria); framework-locked-after-publish (both criterion update and new-criterion creation rejected); auto-retirement of the previous published version; explicit retirement; historical-criteria-retrievable-after-retirement; two test programmes with the same stage code not colliding. |
| Integration (real Postgres) | `tests/integration/reviewLifecycle.test.ts` | Review creation (idempotent, ownership-checked); partial draft save; out-of-range and wrong-framework score rejection; full submission (total computed, audit written); incomplete-submission rejection; post-submission edit rejection; concurrent double-submission (exactly one succeeds, one audit row, consistent total); authorised reopen with a full prior-state snapshot in the audit entry, followed by resubmission and recalculation; unauthorized reopen attempt. |
| Integration (real Postgres) | `tests/integration/reviewPermissions.test.ts` | Programme Director create+publish (authorized); Reviewer denied publish (with a control case proving the framework itself was fine — the denial was about the actor); Programme Secretary denied reopen; a suspended System Administrator denied exactly like any other inactive account. |
| Integration (real Postgres) | `tests/integration/reviewDataIntegrity.test.ts` | The database's own unique constraint refusing a second `ReviewScore` row for one `(review, criterion)` pair, bypassing the service entirely; a submitted review's `reviewFrameworkId` staying pinned to the exact version used even after a newer one publishes and the original retires; `recalculateReview` correcting a directly-corrupted total and auditing the `from`/`to`, with zero audit noise when nothing had actually drifted. |

### Test isolation

Every integration test creates its own `Programme`/`Cohort` (via
`tests/helpers/reviewFixtures.ts`'s `createTestProgrammeAndCohort`) —
not the real PAM-P programme — so `ReviewStage`'s unique
`(programmeId, cohortId, code)` constraint never collides with the real
seeded "Application Review" stage, and cleanup
(`cleanupReviewFixtures`) is a single call per test that deletes
everything under that programme in FK-safe order. Verified after a full
run: zero leftover `test-programme-*` rows, and the one real seeded
stage (`Application Review`, `DRAFT` — it has no published framework
yet, exactly as expected) untouched.

### Real bugs found and fixed via these tests

Two, both in the review lifecycle, both caught by integration tests —
not by typecheck, lint, or a unit test in isolation, since neither
involves a database-level interaction that a pure-function unit test
would exercise:

1. **`NOT_STARTED → SUBMITTED` was missing from the transition table.**
   A reviewer who fills in every score and submits without a separate
   draft-save step is a normal flow — the original table required
   passing through `IN_PROGRESS` first, which the "submits a complete
   review" integration test caught immediately (`InvalidReviewTransitionError`
   on a review that had never been drafted). Fixed by adding the direct
   edge; the unit test suite for `assertTransition` only tests the table
   against itself; it couldn't have caught a *missing* edge that the
   table author simply didn't think to include, only a wrong result
   given the table as written — this is a real category of test
   Phase 2's testing docs already noted integration tests uniquely
   catch.
2. **`tx.reviewStage.update()` (not `updateMany()`) inside the publish
   transaction, guarding "flip to ACTIVE only if not already,"** threw
   Prisma's P2025 ("record not found") whenever the stage was already
   `ACTIVE` — because Prisma's `.update()` requires its `where` to match
   exactly one row and throws otherwise, unlike `.updateMany()`, which
   simply no-ops on zero matches. Caught by the "publishing a new
   version automatically retires the previously published version"
   test, whose second `publishReviewFramework` call hit a stage already
   flipped `ACTIVE` by the first. Fixed by switching to `updateMany`.

## 16. Prisma validation and migration status

```
$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀

$ npx prisma migrate status
Database schema is up to date!
```

## 17. Type-check, lint and build results

```
$ npx tsc --noEmit
(no output — clean)

$ npx eslint .
(no output — clean)

$ npm run build
✓ Compiled successfully
✓ Generating static pages (12/12)
```

Route list unchanged from Phase 2 (still 12 routes) — confirms no
page/Server Action/route handler was added, consistent with §3/§24.

## 18. Security and concurrency considerations

- **Every mutation re-derives the actor's permission server-side**
  (`requirePermission(actorId, ...)`, reading the database fresh) —
  none of the service functions in `frameworkService.ts`/
  `reviewService.ts` accept a role, permission, or authorization claim as
  input at all, so there is no field for a caller to smuggle a bypass
  through even in principle. `tests/integration/reviewPermissions.test.ts`
  demonstrates this directly for framework publishing and review
  reopening.
- **No client-supplied total/weight is trusted.** `submitReview` and
  `saveDraftScores` only ever accept raw per-criterion scores; the total
  is always computed server-side from `calculateReviewTotal`, never
  read from the request.
- **Ownership is checked independently of permission** — a `REVIEWER`
  with `review_scores.submit` still can't act on another reviewer's
  review; `assertOwnership` compares `review.reviewerId` to the actor id
  on every draft-save/submit/removal call.
- **Double submission**: status-conditioned `updateMany` inside a
  transaction (`WHERE id = reviewId AND status = <expected>`) — a
  concurrent second writer's conditional update matches zero rows and
  throws `ReviewConcurrencyError` rather than double-processing.
  Verified with a real `Promise.allSettled` race against two
  simultaneous `submitReview` calls in
  `tests/integration/reviewLifecycle.test.ts`: exactly one succeeds, one
  `REVIEW_SUBMITTED` audit row exists, the final total is consistent.
- **Duplicate criterion score**: two independent layers —
  application-level validation (`validateReviewScores` rejects a
  duplicate `criterionId` within one call) and the database's own
  `@@unique([reviewId, criterionId])` constraint, which
  `tests/integration/reviewDataIntegrity.test.ts` confirms Postgres
  itself enforces even when the service layer is bypassed entirely.
- **No hand-rolled optimistic-concurrency version column.** `status`
  itself is the guard for every status-changing operation, since each
  one already has a well-defined expected "from" state — this is the
  "status conditions in update queries" option §18 lists, chosen over
  an added `version`/`updatedAt` check to avoid an unused extra column
  for a case the status field already covers.
- **Stale draft writes are not specially guarded** — last write for a
  given `(reviewId, criterionId)` wins, matching ordinary form-autosave
  semantics. Judged acceptable: the case that actually matters
  (submission) has full transactional protection; a draft overwrite
  racing another draft overwrite from the *same* reviewer (the only
  actor who can write to their own review) has low real-world stakes.

## 19. Known limitations

- **No administrative override for a closed review period.**
  `submitReview` throws `ReviewPeriodClosedError` unconditionally when
  the stage's `[opensAt, closesAt]` window doesn't contain "now" — §12
  mentions "unless an authorised override applies," but no override
  mechanism (a permission, a flag, an audit trail for using it) was
  built this phase, since nothing in the brief specified what that
  override should look like. `REVIEW_ADMINISTRATIVE_OVERRIDE` is
  reserved in `AUDIT_ACTIONS` for whenever this is built.
- **`createReview`'s "find the active stage" logic assumes exactly one
  active stage per programme/cohort.** V1.0 only has Application Review,
  so this holds today, but a second concurrently-active stage (e.g.
  Interview, once built) would make "the first active stage in sequence
  order" ambiguous — flagged inline in
  `modules/reviews/services/reviewService.ts` and worth resolving (most
  likely: resolve the stage from the `ReviewAssignment`'s own context,
  e.g. an explicit stage/slot field) before a second stage ships.
- **`recalculateReview` has no explicit interaction guard against a
  concurrent submission.** Both operate on the same `Review` row, but
  `recalculateReview` doesn't itself use a status-conditioned update the
  way submission and reopening do — in practice it only runs as an
  administrative action after a reopen, never concurrently with an
  in-flight submission from the same review, but this is an operational
  assumption, not a proven-safe interleaving.
- **`DuplicateCriterionScoreError` is defined but never thrown** — see
  §13. The functional behavior (duplicates are rejected) is fully
  correct and tested; only the specific error *class* used differs from
  what a literal reading of §23's example list might expect.
- **No permanent Playwright/browser E2E suite** was added or run this
  phase — nothing in Phase 3A has a UI surface to exercise (§24
  explicitly asks for tests/scripts over premature UI), so there was
  nothing for a browser test to click through. This is expected, not an
  oversight, given the phase's scope.
- **RBAC remains code-based**, per §15's explicit instruction — restated
  here only because it's a limitation for any future requirement that
  needs runtime-editable roles/permissions without a deploy.

## 20. Decisions requiring programme-owner confirmation

1. **The PAM-P Application Review framework's actual criteria.** This is
   the one genuinely blocking item — the engine is fully built and
   tested, but has nothing to score PAM-P applications against yet. What's
   needed: the approved list of criteria (names), each one's maximum
   score and/or weight (summing to 60 under whatever combination of
   `maxScore × weight` the programme intends), each one's description
   and reviewer guidance, whether any use a rating scale (and if so its
   bands), and their intended display order. Once provided, seeding them
   is a small, mechanical addition to
   `modules/reviews/seed/seedApplicationReviewStage.ts` (or a sibling
   seed function) using the exact same `createCriterion`/
   `createReviewFrameworkDraft`/`publishReviewFramework` service
   functions already built and tested.
2. **Whether a review period override mechanism is needed for V1.0.**
   §19 above — if Application Review submissions should ever be allowed
   after a stage's `closesAt` under specific authorization, that needs
   its own design (who can override, is it audited per-use, does it
   apply per-review or per-stage) before being built; not assumed or
   invented this phase.
3. **Whether `allCriteriaMandatory` should default to `true` or `false`
   at the stage level for Application Review specifically** — the schema
   defaults to `true` (every criterion mandatory unless a future stage
   explicitly opts individual criteria out), which seemed the safer
   default for a fellowship selection process, but this is an assumption
   pending the same criteria-list confirmation as item 1.

## 21. Recommended scope for Phase 3B

Per the brief's explicit "do not continue to Phase 3B automatically"
instruction, nothing beyond this report has been started. Once the
PAM-P criteria (§20, item 1) are confirmed and seeded, the natural next
phase is the Reviewer Workspace itself: assigned-review queue, rubric
rendering against `modules/reviews/services/reviewService.ts`'s
`saveDraftScores`/`submitReview`, blind-review enforcement (a reviewer's
query never returns another reviewer's `Review` row — the repository
layer already scopes by `reviewerId`), and the third-reviewer divergence
trigger once real submitted scores exist to diverge on. Everything the
Reviewer Workspace needs from the domain layer — permission checks,
validation, transactions, audit logging — already exists and is tested;
that phase would be UI and Server Actions calling into what Phase 3A
built, not new domain logic.
