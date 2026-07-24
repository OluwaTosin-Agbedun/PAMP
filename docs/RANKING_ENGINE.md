# Final Ranking Engine

Enterprise Functional Specification Addendum, Modules 4-5 ("Final Ranking" and "Tie
Breaking"). Combines the two scores every prior module built —
`ApplicationScore.reviewAverage` (/60, Release 1 Module 1) and `.interviewAverage`
(/40, Addendum Module 2) — into a Final Score (/100), ranks every eligible application,
and applies the addendum's exact 3-level tie-break rule. See
[ADR-0020](adr/ADR-0020-final-ranking-tier-resolution.md) for the one genuine schema
conflict this module resolved.

## Score calculation

`modules/ranking/domain/ranking.ts`'s `calculateCompositeScore`: `reviewAverage +
interviewAverage`, rounded once to 2dp (`ROUND_HALF_UP`, the same single-rounding-step
discipline as `docs/SCORE_CALCULATION_RULES.md`). A straight sum, no additional
weighting — the addendum's own words ("Application Review (/60) + Interview (/40) =
Final Score (/100)") and the PAM-P 2026 Metrics Framework document's own §9 worked total
(60 + 40 = 100) both confirm this, resolving the "should review or interview count for
more" question [ADR-0015](adr/ADR-0015-review-score-aggregation-formula.md) explicitly
left open.

Computed automatically by `modules/scoring/services/scoreAggregationService.ts`'s new
`recomputeCompositeScore` — called from the tail of both `recomputeReviewAverage` and
`recomputeInterviewAverage`, so `ApplicationScore.compositeScore` stays live without
either caller needing to know a composite score exists. Only writes and audits
(`RANKING_COMPOSITE_SCORE_CALCULATED`) when the value actually changes. Never manually
editable — there is no endpoint that accepts a composite score as input.

## Decision bands

`decisionBandFor` — the PAM-P 2026 Metrics Framework's own §9 grading scale (85-100
Strongly Recommended / 75-84 Recommended / 65-74 Reserve-Borderline / below 65 Not
Recommended), stated as fixed document constants rather than a Configuration Centre
setting — the same treatment Application Review's max-60/Interview's max-40 already get.
Purely informational: never a workflow gate.

## Eligibility

`determineRankingEligibility` — every exclusion this repository's schema can actually
express: soft-deleted (`Application.deletedAt`, the withdrawal signal — no dedicated
withdrawal/disqualification status field exists yet), `eligibilityStatus !== ELIGIBLE`,
an integrity hold on any submitted interview score (`InterviewScore.integrityFlag` or
`recommendation = INTEGRITY_HOLD` — metrics-framework.md §9/§12: "Integrity Concern →
Hold/Disqualify... overrides score"), or a missing `reviewAverage`/`interviewAverage`
(which transitively requires a resolved third-review escalation and a valid 3-or-4
panellist interview submission, since those averages are only ever written once both are
satisfied). Checked in a fixed order, so the first applicable reason is always reported.
Excluded applications are never deleted — the Final Ranking Workspace lists them
separately with their reason.

## Ranking and tie-breaking

`rankApplications` (`modules/ranking/domain/ranking.ts`) sorts descending by composite
score, then applies the addendum's exact Module 5 rule as the sort's own tiebreakers:
**Level 1** — higher interview score wins; **Level 2** — if still tied, higher
application review score wins. Only an application identical on every one of those three
figures ever reaches **Level 3** — flagged as a `tieGroups` entry rather than resolved
automatically, since the addendum requires "Final Selection Committee reviews...
records mandatory justification" for that case. Level 3 applications still receive
distinct, deterministic storage ranks (applicationId-ascending) so the snapshot always
has a total order with no duplicate rank numbers — that storage order is never presented
as the approved resolution.

## Generating and approving a ranking

`modules/ranking/services/rankingService.ts`:

- `generateFinalRanking` (`ranking.generate`, Programme Secretariat) — reads every
  application in the cohort, splits eligible/excluded, ranks the eligible set, and
  records the result as a `RankingSnapshot`/`RankingSnapshotEntry` — the exact
  generalized mechanism `docs/database.md` already designed for "Interview Shortlist,"
  reused rather than a bespoke table. Unlike that shortlist (a truncated top-N candidate
  pool), this stores **every** eligible application — Final Ranking's job is the full
  ranked order, not a cutoff. `targetSize` records the confirmed final-cohort-size policy
  value (`ranking.finalCohortSize`, default 30, Configuration Centre) for reference.
  Refuses to run again while the cohort's current snapshot is locked. Any Level 3 tie
  group also creates a `RankingTieResolution` row (status `PENDING`) and an audited
  `RANKING_TIE_DETECTED` event.
- `approveFinalRanking` (`ranking.approve`, Programme Director + Admin — mirrors
  `REVIEW_FRAMEWORKS_PUBLISH`'s placement, Secretary excluded) — locks the snapshot.
  Refuses while any Level 3 tie from that snapshot is still `PENDING`.
- `reopenFinalRanking` (`ranking.reopen`, System-Administrator-only — mirrors
  `REVIEW_SCORES_REOPEN`'s exact placement) — unlocks, with a mandatory recorded reason.
- `resolveTie` (`ranking.resolve_ties`, Selection Committee Member — mirrors
  `COMMITTEE_REVIEW`'s placement) — records the committee's chosen order within a tied
  group plus a mandatory justification. Never touches `ApplicationScore` or
  `RankingSnapshotEntry` — a tie resolution records the committee's decision, it does not
  alter a calculated score.

Every action above writes a structured audit event
(`RANKING_GENERATED`/`RANKING_TIE_DETECTED`/`RANKING_TIE_RESOLVED`/`RANKING_APPROVED`/
`RANKING_REOPENED`/`RANKING_EXPORTED`, alongside the score-level
`RANKING_COMPOSITE_SCORE_CALCULATED`).

## Workspace

`app/(dashboard)/ranking` (inside the existing "Selection Committee" nav slot — the
12-item taxonomy is closed, and Final Ranking is what feeds Module 6's confirmation, the
same "one slot, multiple role-scoped views" pattern "Interview Management" already
uses). The list shows rank, pathway, both component scores, final score, decision band,
and whether an entry falls within the configured final cohort size — plus a live-drift
indicator when an upstream score correction has changed a ranked application's composite
score since the snapshot was generated (`docs/database.md`'s "prevent stale rankings
from being presented as current," made visible rather than silent). The candidate detail
page (`/ranking/[applicationId]`) shows one application's eligibility, calculation, and
current ranking/tie status — reviewer/panellist score breakdowns and comments stay behind
their own existing permissions (`review_scores.view`/`interview_scores.view_all`) on the
Review/Interview Workspaces rather than being duplicated here.

`ranking.export` (Secretariat + Director + Admin) produces a CSV — ranking-relevant
fields only, no reviewer/panellist identities or comments, the same data-minimization
discipline as `reviewOperations/services/exportService.ts`.

## Deliberately not built (later Addendum modules)

Module 6 (Selection Committee's own "confirm Top 30 Fellows"/"confirm Reserve List"
workflow — `CommitteeVote`/`CommitteeDecision`/`SelectionOutcome`, schema-only since the
original pre-addendum brief, still untouched), Module 7 (Reserve List promotion), and
Module 8 (Offer Management, 7-day countdown) are out of scope for this module — only the
ranking + Level 3 tie-flag data those modules will consume was built, per the addendum's
own module boundaries.
