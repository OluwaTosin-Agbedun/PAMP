# Scoring Engine

`modules/reviews/domain/scoring.ts` — the one authoritative scoring
implementation (§10). Every place in this codebase that needs a review
total calls into here; nothing reimplements the formula elsewhere. Pure:
no I/O, no Prisma queries, no `Date.now()` — the same `(entries,
criteria)` input always produces the same output (§9's determinism
requirement), which is also what makes this module trivial to unit test
in isolation (`tests/unit/reviewScoring.test.ts`).

## Decimal strategy

Every calculation uses `Prisma.Decimal` (the `decimal.js` library Prisma
Client already bundles for `Decimal`-typed columns) instead of native
`number` arithmetic. Binary floating point cannot represent values like
`0.1` exactly — summing many criterion scores/weights with native
`number` would accumulate silent rounding error in an authoritative
total. `1.005` has no exact binary float representation (`0.1 + 0.2 !==
0.3` in native JS); `Decimal` handles both correctly.
`modules/reviews/constants/scoring.ts` documents this and defines the
two rounding constants used everywhere: `SCORE_DECIMAL_PLACES = 2`,
`SCORE_ROUNDING_MODE = Decimal.ROUND_HALF_UP`.

**Rounding happens exactly once**, at the very end of
`calculateReviewTotal` — every intermediate value (a criterion's
weighted contribution, the running sum across criteria) is kept at full
`decimal.js` precision. Rounding per-criterion first and then summing
would compound error across criteria; rounding once at the end does not.
The displayed total and the stored total (`Review.totalScore`,
`Decimal(6,2)`) are therefore always the same number — there is no
separate "display rounding" step anywhere in this codebase.

## The functions

| Function | What it computes |
|---|---|
| `calculateCriterionScore(rawScore, weight)` | `rawScore × weight`, unrounded — one criterion's contribution. |
| `calculateReviewRawScore(entries)` | Sum of raw scores as entered, ignoring weight — for display/debugging, not the authoritative total. |
| `calculateReviewWeightedScore(entries, criteria)` | Sum of `score × weight` across every entry matching a known criterion, unrounded. Entries with an unrecognized `criterionId` are silently skipped here — this is a calculation function, not a validator; `validateReviewScores` (see [`docs/REVIEW_LIFECYCLE.md`](REVIEW_LIFECYCLE.md)) is what rejects an unknown criterion with a structured error. |
| `calculateReviewTotal(entries, criteria, scoringMethod)` | The authoritative total — dispatches on `scoringMethod`, rounds once at the end. This is the only function that rounds. |
| `calculateFrameworkMaxScore(criteria)` | Sum of `maxScore × weight` across active criteria — what publish-validation checks against the stage's declared maximum (see [`docs/REVIEW_FRAMEWORK.md`](REVIEW_FRAMEWORK.md)). |
| `getReviewScoreBreakdown(entries, criteria, scoringMethod)` | Per-criterion breakdown (raw score, weighted contribution, comment) plus the authoritative total and the framework's max possible — what a review detail screen would render once one exists, and what `recalculateReview` compares against the persisted total to detect drift. |

## Scoring methods

`ReviewScoringMethod` (Prisma enum, on `ReviewFramework.scoringMethod`):
today, exactly one value, `WEIGHTED_SUM`. This deliberately covers both
"weighted" and "unweighted" scoring from the brief's §9 list — an
unweighted framework is simply one where every criterion's `weight` is
left at its default of `1`, so `WEIGHTED_SUM` reduces to a plain sum in
that case. There is no separate "direct score" code path; weight `= 1`
*is* how direct/unweighted scoring is expressed.

Rating-scale scoring (the brief's third listed method) is not a
different *calculation* — it's a different *validation* constraint on
what a valid raw score is (must match one of the scale's band values
exactly, see [`docs/REVIEW_FRAMEWORK.md`](REVIEW_FRAMEWORK.md#ratingscale--ratingscaleband)).
Once a valid score is established, it's summed with the same `score ×
weight` formula as any other criterion. This is why the codebase doesn't
need a `RATING_SCALE` case in `calculateReviewTotal`'s dispatch.

Percentage-normalised scoring (the brief's fourth, hypothetical method)
is **not implemented** — nothing in the PAM-P brief's mandatory context
(§4) or this repository requires it, and building an unused code path
would be exactly the "don't activate methods that aren't needed"
instruction §9 gives directly. The `switch` in `calculateReviewTotal` is
structured as a dispatch specifically so adding a second method later is
one new `case`, not a rewrite of the function's signature or any of its
callers — verified by the `default` branch's TypeScript exhaustiveness
check (`scoringMethod satisfies never`), which would fail to compile the
moment a new enum value is added without a matching case.

## Why this is separate from validation

`modules/reviews/domain/validation.ts` (business-rule score validation)
and `modules/reviews/domain/frameworkValidation.ts` (publish-time
framework validation) are deliberately different files from
`scoring.ts` — calculation and validation are different concerns with
different inputs and different testing needs. `scoring.ts` never
rejects anything; it computes whatever it's given. Validation happens
first, in the service layer, before a score ever reaches a calculation
function — see [`docs/REVIEW_LIFECYCLE.md`](REVIEW_LIFECYCLE.md) for the
validation rules themselves.
