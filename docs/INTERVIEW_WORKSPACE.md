# Interview Workspace

Release 1, Module 2. The panellist-facing UI for scoring interviews:
queue, applicant summary, question framework, individual scoring, panel
comments, draft save with autosave, and independent submission. Mirrors
[`docs/REVIEWER_WORKSPACE.md`](REVIEWER_WORKSPACE.md)'s shape closely —
same autosave debounce, same Decimal→string view-model boundary, same
thin-Server-Action pattern — narrowed everywhere `InterviewCriterion`'s
flatter shape requires it. See
[ADR-0016](adr/ADR-0016-interview-workspace-scope-boundary.md) for the
full reasoning behind what this module does and does not own, split from
Module 3 (Interview Scoring Engine).

All of this lives in `modules/interviews/{domain,repositories,services}`
plus `app/(dashboard)/interviews/`. No schema migration was needed — the
schema already had every field this module reads or writes.

## Routes

| Route | Purpose |
|---|---|
| `/interviews` | A panellist's own interview queue — `listMyInterviews`, scoped server-side to the caller's own active panel seats. |
| `/interviews/[interviewId]` | Applicant summary, meeting link, question framework, and either the scoring form (in-progress) or a locked read-only summary (submitted/recused). |

Gated on `interviews.view` (queue) / `interviews.score` (detail — scoring
*is* the page's purpose, the same "the core action gates the page"
pattern the Reviewer Workspace's `[assignmentId]` route uses with
`reviews.perform`).

## Data flow

`getInterviewWorkspaceView(actorId, interviewId)` is the one call the
detail page needs: loads the interview + applicant, calls
`getOrCreateInterviewScore` (idempotent — creates the panellist's
`InterviewScore` row on first visit, exactly like `createReview` does for
`Review`), loads the cohort's active `InterviewCriterion` rows, and
returns a non-numeric submission-progress count (`submittedCount` /
`totalPanelists`) alongside it.

Every function in `interviewScoreService.ts` takes the caller's own
`interviewId`/`interviewScoreId` — never another panellist's — so "scores
remain hidden until all four have submitted" (the brief, verbatim) is a
structural property of the API, not a filter that could be forgotten at
a new call site. See ADR-0016 for the full reasoning, including why a
"compare all panellists' scores" screen is deliberately not part of this
module (that's the brief's Module 6, "Compare scores").

## Scoring

`InterviewCriterion` has no rating scale, mandatory-question flag, or
decimal-policy field (Module 3's charter — see ADR-0016), so
`modules/interviews/domain/interviewScoreValidation.ts` checks only what
the schema can express: a score is a finite number in `[0, maxScore]`,
against a known active criterion. Submission requires at least one valid
score, not every criterion — the least-committal completeness rule that
still makes "Submission" meaningful without inventing a mandatory-
questions policy Module 3 hasn't built yet.

`modules/interviews/domain/interviewScoring.ts` computes the per-
panellist total by reusing `modules/reviews/domain/scoring.ts`'s
weighted-sum primitives directly — `calculateReviewWeightedScore`/
`calculateFrameworkMaxScore` are generic over `{id, weight}` /
`{maxScore, weight, isActive}` shaped criteria, and `InterviewCriterion`
has exactly those fields, so there is no interview-flavoured copy of the
maths. `InterviewScore.totalScore` is one panellist's own weighted total
— not yet averaged across the panel or combined with review score, both
Module 3.

## Score lifecycle

`ScoreSubmissionStatus`: `DRAFT`, `SUBMITTED`, `RECUSED` — simpler than
`Review`'s six-state graph, since `InterviewScore` has no reopen fields
at all yet.

```
DRAFT ──▶ SUBMITTED
   │
   └──▶ RECUSED
```

`modules/interviews/domain/scoreLifecycle.ts`'s `SCORE_TRANSITIONS` is
the one authoritative table, throwing the same `InvalidStatusTransitionError`
every other lifecycle in this codebase uses. `submitInterviewScore` is
transactional and status-conditioned (`updateScoreStatus`'s `where:
{status: fromStatus}`), so a double submission fails cleanly
(`ReviewAlreadySubmittedError`) rather than double-processing — the same
pattern `reviewService.submitReview` established.

## Autosave

Identical mechanics to the Reviewer Workspace
([ADR-0010](adr/ADR-0010-reviewer-workspace-autosave-and-serialization.md)):
1.2s debounce after each keystroke, resends every currently-filled-in
score each tick (safe, since `saveDraftInterviewScores` upserts by
criterion), `aria-live="polite"` status region, explicit separate submit
action.

## Interview period gating

`submitInterviewScore` checks the cohort's `INTERVIEW`-coded
`ProgrammeWindow` (Release 1.5's Configuration Centre plumbing, unused
until now) the same way `reviewService.submitReview` checks
`ReviewStage.opensAt/closesAt` — a missing window row means "no
restriction," an explicit `opensAt`/`closesAt` is enforced. Draft saves
are never blocked by the window, only submission, matching the review
side's behaviour. Reuses `ReviewPeriodClosedError` with an interview-
specific message rather than a new class, the same "reuse Review-named
errors with contextual messages" pattern Module 1 established.

## Not built this module

Deferred to Module 3 (see ADR-0016 for the full list): configurable
mandatory/comment-required per question, a rating-scale option, and
tie-breaking. **Cross-panellist averaging and the final interview score
were built by the Addendum's Module 2 (Interview Scoring Revision), not
Module 3** — see [`docs/INTERVIEW_SCORING_REVISION.md`](INTERVIEW_SCORING_REVISION.md)
and [ADR-0018](adr/ADR-0018-interview-scoring-revision.md), which also
replaced this module's single `comments` field with four structured
fields. Deferred to Module 6: comparing all panellists' scores side by
side. Deferred to Module 4 (Interview Operations Workspace): the
Secretariat-facing schedule/attendance/reassignment dashboard.

## Audit actions (Module 2 additions to `lib/audit/actions.ts`)

`INTERVIEW_DRAFT_SCORE_SAVED`. `INTERVIEW_SCORE_SUBMITTED` already
existed (declared with the original schema, never used until now) and is
reused as-is.

## Testing

`tests/unit/{scoreLifecycle,interviewScoring,interviewScoreValidation}.test.ts`
cover the pure domain layer. `tests/integration/interviewWorkspace.test.ts`
covers ownership scoping, draft/submit persistence and locking, the
cross-panellist independence guarantee, interview-window gating, and
RBAC denial. `tests/e2e/accessibility.spec.ts` scans `/interviews` and
`/interviews/[interviewId]` (desktop and mobile viewports) with axe-core
and confirms the scoring input is keyboard-operable — zero violations
found on either screen.
