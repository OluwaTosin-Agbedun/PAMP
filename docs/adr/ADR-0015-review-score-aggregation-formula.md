# ADR-0015: Review Score Aggregation Formula for Non-Escalated Applications

**Status**: Accepted, flagged for programme-owner confirmation (Release 1 Module 1)

## Context

`ApplicationScore` (database-design phase) has carried `reviewAverage`
since before any code populated it — its doc comment says it's "written
only by ScoreAggregationService," a service every phase since Phase 3B
has explicitly deferred. Release 1 Module 1 (Interview Assignment
Engine) is the first module that actually needs it: assigning "the Top
70 applicants" to interview panels requires knowing each application's
review score to rank by.

`docs/THIRD_REVIEW_ENGINE.md` documents the **escalated** case's formula
precisely: the lower of Reviewer 1/Reviewer 2's scores, averaged with
the third reviewer's score
(`calculateFinalScoreAfterThirdReview`). Neither that document, the
Phase 3A/3B briefs, nor `docs/SCORE_CALCULATION_RULES.md` state what the
application's score is when R1 and R2 **don't** diverge — the ordinary,
majority case.

## Decision

`modules/scoring/services/scoreAggregationService.ts`'s
`recomputeReviewAverage`:

- **No escalation, both R1 and R2 submitted**: `reviewAverage =
  mean(R1.totalScore, R2.totalScore)`, rounded to 2 decimal places
  (`ROUND_HALF_UP`, the same rounding this codebase already uses
  everywhere a score is finalized —
  `docs/SCORE_CALCULATION_RULES.md`).
- **Escalation exists and is resolved**: `reviewAverage =
  ReviewEscalation.resolvedFinalScore` verbatim — never recalculated,
  consistent with every other consumer of that field
  (`docs/REVIEW_MONITORING_AND_ESCALATION.md`, Phase 3D).
- **Escalation exists but unresolved, or fewer than 2 submitted
  reviews**: `reviewAverage` stays `null` — the application isn't
  ranking-ready yet, not assigned a partial or guessed figure.

## Reasoning

Averaging is not a novel choice introduced here — it is the exact
operation this codebase already performs whenever it combines multiple
independent reviewers' scores into one figure: the escalated case's own
formula *ends* with an average (of the lower first-two score and the
third reviewer's score). Applying the same operation to the simpler,
more common non-escalated case (averaging exactly two scores instead of
two-after-a-substitution) is the minimal, consistent extension of an
already-decided pattern — not equally-valid-alternative territory in
the way, say, "should review or interview count for more of the final
score" is (a genuinely open question, left to Module 5 and the
Configuration Centre).

## Alternatives considered

**Take the higher of the two scores** (benefit of the doubt to the
applicant). Rejected — no evidence anywhere in this codebase's
documentation suggests an asymmetric rule; averaging treats both
reviewers' independent judgement equally, matching the "blind,
independent review" principle this entire assignment engine is built
around.

**Leave `reviewAverage` unbuilt until a programme owner confirms the
formula, blocking Module 1 entirely.** Rejected as unnecessarily
blocking — the formula is a natural, low-risk extension of an existing,
already-approved pattern, not an invented one from nothing. Flagging it
here, in code comments, and requiring no further code change if
confirmed, is proportionate; a hard block would stall four modules'
worth of otherwise-buildable work over a decision this session has
strong, documented evidence for.

## Consequences

- If a programme owner specifies a different non-escalated formula
  later, exactly one function (`recomputeReviewAverage`) changes — every
  consumer (the Interview Assignment Engine's shortlist, later the
  Final Ranking Engine) reads `ApplicationScore.reviewAverage` and never
  recomputes it itself, so the blast radius of a correction is
  contained to this one file.
- `reviewScoreCount` is stored alongside `reviewAverage` specifically so
  a future UI/report can distinguish "ranked from 2 reviews" from
  "ranked from 3 (escalated)" without re-deriving it.
