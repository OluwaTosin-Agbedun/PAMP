# Third-Review Escalation Engine

§2/§9 of the Phase 3B brief: when Reviewer 1 and Reviewer 2's scores
diverge past a configured threshold, the system automatically assigns a
third reviewer and resolves the final score from all three.
`modules/reviews/domain/thirdReviewEngine.ts` holds the pure math;
`modules/reviews/services/assignmentService.ts`'s `checkAndHandleEscalation`,
`assignThirdReviewer`, and `resolveEscalationForThirdReview` orchestrate
it.

## Divergence is a percentage, not raw points

"13 percentage points" only means the same thing across every framework
if it's measured as a **percentage of that framework's max possible
score**, not a raw point gap — a 13-point gap is enormous on a
15-point framework and negligible on a 200-point one. So:

```
divergencePercent = |score1/max × 100 − score2/max × 100|
```

`calculateDivergencePercent(score1, score2, maxPossibleScore)` computes
this with exact `Prisma.Decimal` arithmetic (never floating point) and
throws if `maxPossibleScore <= 0`. `maxPossibleScore` is
`ReviewFramework.totalConfiguredScore`, the same field
Phase 3A's scoring engine already computes and stores per framework —
reused, not recomputed.

**Worked example**: on a 60-point Application Review framework,
Reviewer 1 scores 51 (85%) and Reviewer 2 scores 39 (65%) — a
20-percentage-point divergence, which exceeds the default 13pp
threshold and escalates. The same 20pp divergence would also escalate on
a 100-point framework (85 vs. 65) or a 15-point one (12.75 vs. 9.75) —
the *ratio* of disagreement is what's compared, not the absolute gap.

## Threshold is configurable, not hardcoded

`SETTINGS_KEYS.THIRD_REVIEW_DIVERGENCE_THRESHOLD_PERCENT` — a
`SystemSetting` row, read through `lib/settings/service.ts`'s
`getNumericSetting`, defaulting to **13** when no row exists (so a fresh
database needs no separate settings-seeding step). `exceedsDivergenceThreshold`
is a strict greater-than — a divergence exactly equal to the threshold
does **not** escalate.

## When the check runs

`checkAndHandleEscalation(applicationId)` runs from `onReviewSubmitted`
(see [`docs/REVIEW_ASSIGNMENT_ENGINE.md`](REVIEW_ASSIGNMENT_ENGINE.md#assignment-lifecycle))
every time a `FIRST` or `SECOND` review submits. It's a no-op unless
*both* the `FIRST` and `SECOND` assignments for that application are
currently active and `SUBMITTED` — so it correctly does nothing after
the first of the pair submits, and correctly runs again (finding both
now submitted) after the second does. It's idempotent: the
`ReviewEscalation` table's `@@unique([applicationId, firstReviewId,
secondReviewId])` means a second call for an already-escalated pair
(e.g. a retried invocation) is a no-op once the row exists.

- **Not exceeding the threshold**: both assignments move straight to
  `COMPLETED`. No escalation row is created.
- **Exceeding the threshold**: a `ReviewEscalation` row is created
  (`scoreDifference`, `thresholdApplied` recorded for audit), both
  assignments move to `ESCALATED`, a `REVIEW_ESCALATION_TRIGGERED` audit
  entry is written, and automatic third-reviewer selection is attempted.

## Selecting the third reviewer

`assignThirdReviewer` reuses the exact same eligibility filtering and
workload-balancing pipeline as any other assignment
(`modules/reviews/domain/{reviewerEligibility,workloadBalancing}.ts`),
with `excludeReviewerIds: [firstReviewerId, secondReviewerId]` — R1 and
R2 can never be selected as R3, on top of the ordinary
capacity/availability/conflict checks every candidate goes through.
`ThirdReviewAlreadyExistsError` guards against a second `THIRD`
assignment ever being created for the same application.

**If no eligible reviewer exists**, `NoEligibleReviewersError` is caught
inside `checkAndHandleEscalation` and swallowed — the escalation row
stays recorded with `thirdReviewAssignmentId: null`. Automatic escalation
must never block or fail a reviewer's own submission just because the
pool happens to be exhausted at that moment. `assignThirdReviewer` is
exported separately so a Programme Secretary can retry it manually once
more reviewers become available (a Phase 3D UI concern; the service
function is ready now).

## Blindness

§9: "third reviewers must not know they are resolving a disagreement
unless programme policy explicitly requires this." V1.0 declares no such
policy. A `THIRD` assignment is created via the identical
`ReviewAssignment` row shape as `FIRST`/`SECOND` (`slot: "THIRD"`,
`assignedMethod: "AUTO"`), and reviewed through the identical
`createReview`/`submitReview` path — nothing about "this is a
disagreement-resolution review" is written anywhere the reviewer's own
queries (`listMyAssignments`, `createReview`, the eventual Reviewer
Workspace) can see. Only the `ReviewEscalation` row itself — visible
solely behind `assignments.view` (oversight roles) — records that
context.

## Resolving the escalation

Once the `THIRD` review submits, `onReviewSubmitted` routes to
`resolveEscalationForThirdReview` instead of `checkAndHandleEscalation`.
§2's formula:

```
finalScore = ( min(score1, score2) + thirdReviewerScore ) / 2
```

`calculateFinalScoreAfterThirdReview` computes this with exact Decimal
arithmetic, rounding once at the end (same `SCORE_DECIMAL_PLACES`/
`SCORE_ROUNDING_MODE` as Phase 3A's `calculateReviewTotal`) — never the
*average of all three*, which is a different, explicitly-rejected
formula: taking the lower of the first two, not their average, is what
makes this a genuine tie-break toward the more critical of the two
original reviewers rather than a simple three-way mean.

**Worked example**: R1 scores 51/60, R2 scores 39/60 (the escalating
pair above), R3 scores 45/60. `min(51, 39) = 39`; `(39 + 45) / 2 = 42`.
The final score is 42, not `(51+39+45)/3 ≈ 45`.

`ReviewEscalation.resolvedFinalScore` and `resolvedAt` are set; the
`THIRD` assignment moves to `COMPLETED`, and both `ESCALATED`
`FIRST`/`SECOND` assignments move to `COMPLETED` alongside it.

**This deliberately does not write to `ApplicationScore`.** That table's
sole writer is the not-yet-built Sequence 3 `ScoreAggregationService`
(see [`docs/database.md`](database.md#applicationscore-the-aggregation-cache))
— Phase 3B computes and stores the resolved score on the escalation
record itself, preserving that boundary rather than reaching into
out-of-scope territory.

## Testing

`tests/unit/thirdReviewEngine.test.ts` covers the pure math in isolation
(divergence normalization across framework sizes, threshold
strictness, the lower-of-two-plus-third formula). `tests/integration/
reviewAssignmentEngine.test.ts` covers the end-to-end flow against real
Postgres: no escalation under threshold, escalation with automatic R3
selection excluding R1/R2, resolution producing the correct final score
and status transitions, and an escalation with no eligible third
reviewer left unresolved rather than blocking submission.
