# Score Calculation Rules

A quick-reference formula sheet. See
[`docs/SCORING_ENGINE.md`](SCORING_ENGINE.md) for the module
architecture and the reasoning behind these rules, and
[`docs/REVIEW_FRAMEWORK.md`](REVIEW_FRAMEWORK.md) for what a criterion's
fields mean.

## The formula

For a review with scored criteria `c₁ … cₙ`, each with a raw score `sᵢ`
and a configured weight `wᵢ`:

```
criterion contribution:  cᵢ = sᵢ × wᵢ
review total:            T  = round₂(Σ cᵢ)
```

Rounding (`round₂`, to 2 decimal places, `ROUND_HALF_UP`) happens
**once**, after summing every criterion's *unrounded* contribution —
never per-criterion. `1.005` rounds up to `1.01` (the exact halfway
case, correctly handled by `Decimal.ROUND_HALF_UP` — a native
floating-point implementation would frequently get this wrong due to
`1.005` having no exact binary representation).

An unweighted framework is the same formula with every `wᵢ = 1` (the
default) — `T = Σ sᵢ`, rounded once at the end exactly the same way.

## Worked example

Two criteria, weight 1 each, both scored:

| Criterion | Raw score | Weight | Contribution |
|---|---|---|---|
| Academic merit | 8 | 1 | 8 |
| Community impact | 6 | 1 | 6 |

`T = round₂(8 + 6) = 14`.

With a weight applied (Community impact weighted ×1.5):

| Criterion | Raw score | Weight | Contribution |
|---|---|---|---|
| Academic merit | 8 | 1 | 8 |
| Community impact | 6 | 1.5 | 9 |

`T = round₂(8 + 9) = 17`. Note the framework's *configured maximum*
would then be `(maxScore_academic × 1) + (maxScore_impact × 1.5)`, not a
simple sum of the two `maxScore` values — this is exactly what
`calculateFrameworkMaxScore` computes and what publish-validation checks
against the review stage's declared total (§8).

## What counts toward the total

- Only **active** criteria (`isActive: true`) — an inactive criterion
  (only possible pre-publish; see
  [`docs/REVIEW_FRAMEWORK.md`](REVIEW_FRAMEWORK.md)) contributes nothing
  and isn't counted toward the framework's configured maximum either.
- Only criteria that belong to the review's **own framework version**
  (`Review.reviewFrameworkId`) — a score entry for a criterion from a
  different framework is rejected before it ever reaches a calculation
  function (`UNKNOWN_CRITERION`, see
  [`docs/REVIEW_LIFECYCLE.md`](REVIEW_LIFECYCLE.md)).
- A **draft** review's total reflects whatever's been scored so far —
  `calculateReviewTotal` doesn't know or care whether a review is
  complete; completeness is a validation concern (§12), not a
  calculation one. Saving a partial draft still recomputes and persists
  `Review.totalScore` from whatever scores exist, so a progress display
  is always accurate even before submission.

## Displayed vs. stored value

**Identical, always.** There is no separate "display rounding" —
`calculateReviewTotal`'s single rounding step produces the exact value
that gets persisted to `Review.totalScore` (`Decimal(6,2)`) and the
exact value a UI would show. `recalculateReview`
(`modules/reviews/services/reviewService.ts`) exists specifically to
catch and correct the rare case where these could drift apart (e.g. a
direct database edit bypassing the service layer, or scores changed
after a reopen without a fresh submission) — it recomputes from the
current `ReviewScore` rows and overwrites the stored value if it
differs, writing a `REVIEW_RECALCULATED` audit entry with the `from`/`to`
values when (and only when) something actually changed.

## The PAM-P Application Review total

The stage's `maxTotalScore` is `60`, per the Phase 3A brief's §4
("Mandatory Business Context") — the one number stated directly in the
brief itself, not derived from a document. The 6 individual criteria
(Leadership Potential, Ethical Orientation and Judgement, Purpose and
Motivation, Pathway Alignment, Communication and Quality of Thought,
Commitment and Readiness) and their weights are seeded from the PAM-P
2026 Application Review Guidelines and Scoring document —
`modules/reviews/seed/seedApplicationReviewCriteria.ts` — each with
`maxScore = 5` (the 0-5 rating a reviewer enters) and
`weight = allocatedMarks / 5`, so `Σ(maxScore × weight) = 60` exactly.
