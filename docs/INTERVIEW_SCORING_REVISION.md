# Interview Scoring Revision

Enterprise Functional Specification Addendum, Module 2. Revises the
[Interview Workspace](INTERVIEW_WORKSPACE.md) (Release 1 Module 2,
[ADR-0016](adr/ADR-0016-interview-workspace-scope-boundary.md)) against
the Addendum's more specific §2 brief: structured comments, a 3-of-4
minimum submission threshold with a Secretariat override, and
post-submission visibility of the averaged score. See
[ADR-0018](adr/ADR-0018-interview-scoring-revision.md) for the full
reasoning, including the one flagged, unconfirmed interpretation (how
§2.5's threshold and §2.6's override interact).

## Schema

One migration
(`prisma/migrations/20260720100000_addendum_module2_interview_scoring_revision`):

- `InterviewScore.comments` (single freeform field) → four fields:
  `overallAssessment`, `strengths`, `concerns`, `recommendation`.
- `Interview` gains `scoringOverrideAt`/`scoringOverrideById`/
  `scoringOverrideReason`/`scoringOverrideMissingPanelistId` — set only by
  the Secretariat override, never cleared.

## Submission threshold

`modules/interviews/domain/scoringThreshold.ts`'s
`evaluateSubmissionThreshold` is pure and active-panel-size-aware (never
hardcoded to 4 — `cancelPanelist` never auto-replaces a cancelled seat, so
an interview's active panel can be fewer than 4 by the time scoring
happens):

| Status | Meaning |
|---|---|
| `INCOMPLETE` | Fewer than 3 valid (`SUBMITTED`) scores. |
| `ALL_SUBMITTED` | Every active panellist has submitted. |
| `OVERRIDE_ELIGIBLE` | At least 3 valid, exactly one active panellist missing — the Secretariat may close it. |
| `OVERRIDE_NOT_ELIGIBLE` | At least 3 valid, but more than one still missing (a shrunk active panel case). |

`isScoringThresholdMet` — true only when `ALL_SUBMITTED` or
`scoringOverrideAt` is set. Reaching 3 valid submissions alone does
**not** meet it (the flagged interpretation above); `ApplicationScore.interviewAverage`
is still computed and kept current from 3 onward, but a panellist's own
visibility into it, and any further score mutation on the interview,
stays gated until one of those two conditions is true.

## Secretariat override

`closeInterviewWithOverride` (`interviewScoreService.ts`), gated on the
new `interview_scoring.close_override` permission (Programme Secretariat
only, per the Addendum's own wording):

1. Requires `OVERRIDE_ELIGIBLE` — else `InsufficientSubmissionsError`.
2. The missing panellist is derived server-side from the panel's actual
   submission state, never taken from client input.
3. Status-conditioned write (`applyScoringOverride`, same optimistic-
   concurrency pattern as `updateScoreStatus`) — a write only succeeds if
   `scoringOverrideAt` is still `null`.
4. Audits `INTERVIEW_SCORING_CLOSED_WITH_OVERRIDE` with the reason and
   missing panellist in `metadata`.
5. Recomputes `ApplicationScore.interviewAverage` from the valid
   submissions.

Once set, `saveDraftInterviewScores`/`submitInterviewScore` both reject
further mutation on this interview with `InterviewScoringClosedError` —
this is what prevents a late 4th submission from silently coexisting with
an already-locked, already-computed average.

## Averaging

`modules/scoring/services/scoreAggregationService.ts::recomputeInterviewAverage`,
a direct sibling of `recomputeReviewAverage` (same file, same shape):
mean of `SUBMITTED` scores' `totalScore`, never fewer than 3, rounded
once (`toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)`), written to
`ApplicationScore.interviewAverage`/`interviewScoreCount` via a sibling
`upsertInterviewAverage` that only ever touches interview-prefixed
columns on that row. Called unconditionally at the tail of
`submitInterviewScore` (idempotent, cheap — same call-site pattern
`recomputeReviewAverage` already uses on the review side) and again at
the tail of `closeInterviewWithOverride`.

`interview.weighting_percent` is **not** touched here — combining
`interviewAverage` with `reviewAverage` into `compositeScore` is Module
4's (Final Ranking's) job.

## Visibility

- **A panellist** (`getInterviewWorkspaceView`): own score, own comments,
  always. The averaged score only, once `isScoringThresholdMet` — never
  another panellist's score or comments. Structurally enforced the same
  way the rest of this module enforces "own data only": no function here
  accepts another panellist's id as an argument.
- **Programme Secretariat / Selection Committee / Executive**
  (`getInterviewScoreOverviewForSecretariat`, gated on
  `interview_scores.view_all`): every panellist's score and all four
  comment fields, plus the average, always. `SELECTION_COMMITTEE_MEMBER`
  and `EXECUTIVE` already exist as provisionable roles (their own feature
  modules — 6 and 8 — aren't built yet), so the permission is granted to
  all three roles now rather than only Secretariat, per
  `handoff/REMAINING_WORK.md`'s "permission-gate now, consume once the UI
  exists" instruction.

## Routes

| Route | Purpose |
|---|---|
| `/interviews/scoring-oversight/[interviewId]` | New. Every panellist's score/comments, the average, and (when eligible and not yet closed) the override form. Gated on `interview_scores.view_all`. |
| `/interviews/scheduling/[interviewId]` | Unchanged route; gained a conditional "View panel scores" link to the oversight page for holders of `interview_scores.view_all`. |

## Testing

`tests/unit/scoringThreshold.test.ts` covers the pure threshold logic,
including panel sizes other than 4. `tests/integration/interviewWorkspace.test.ts`
covers the four-field comment round-trip, average computation on the 4th
submission, visibility gating before/after the threshold, override
rejection below the 3-valid floor, a successful 3-of-4 override with its
audit entry, the post-override submission block, and RBAC on the
Secretariat overview.
