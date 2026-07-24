# ADR-0018: Interview Scoring Revision (Addendum Module 2)

**Status:** Accepted, one interpretation flagged for programme-owner confirmation
**Date:** 2026-07-20
**Context:** Enterprise Functional Specification Addendum, Module 2 (Interview Scoring)

## Context

ADR-0016 built the Interview Workspace's per-panellist scoring experience
deliberately minimal, against the original overnight brief, and named
three things it explicitly deferred to a later module: a per-submission
structured comment shape, cross-panellist averaging, and the "scores
remain hidden until all four have submitted" visibility rule's exact
unlock condition. The Enterprise Functional Specification Addendum (§2)
is that later module, and is materially more specific than the original
brief on exactly these three points, plus two the original brief didn't
mention at all:

1. **Structured comments (§2.3)** — Overall assessment / Strengths /
   Concerns / Recommendation, not one freeform field.
2. **A 3-of-4 minimum submission threshold with an explicit Secretariat
   override (§2.5–§2.6)** — "Close Interview with Three Valid Scores,"
   requiring a mandatory reason and recording the missing panellist.
3. **Post-submission visibility of the averaged score only (§2.4)** — a
   panellist who has already submitted may additionally see the final
   average, never another panellist's individual score or comments.

## Decision

1. **Structured comments as four flat nullable columns** on
   `InterviewScore` (`overallAssessment`, `strengths`, `concerns`,
   `recommendation`), replacing `comments` in the same migration. This
   matches the flat-column style every other model in this schema uses
   (`ApplicationScore`, `Review`) — no JSON blob, no side table. Nothing
   outside this module's own service/UI/tests read `InterviewScore.comments`
   (grep-verified before the drop), and this is pre-production data, so no
   backfill migration was needed.

2. **The missing-panellist / override state lives on `Interview`**
   (`scoringOverrideAt`/`scoringOverrideById`/`scoringOverrideReason`/
   `scoringOverrideMissingPanelistId`), not a new `ScoreSubmissionStatus`
   value, and not a reuse of the existing `RECUSED` status.
   `RECUSED` is declared in `scoreLifecycle.ts`'s transition table but is
   never actually written by any service function in this codebase today
   — grep-verified. Semantically it means a panellist declared a conflict
   of interest, which is not what "never got around to submitting" means;
   reusing it would risk colliding with a future genuine recusal feature.
   The non-submitting panellist's own `InterviewScore` row is left
   untouched at `DRAFT`.

3. **Interpretation of §2.5 vs §2.6 (flagged, not confirmed):** reaching
   three valid submissions alone does **not** unlock the average or close
   the interview to further changes — only every active panellist
   submitting, or an explicit Secretariat override, does. This is the
   only reading under which §2.6's override action does meaningful work
   rather than being redundant with §2.5 ("if 3 or 4 submit, interview
   proceeds"). Under this reading, "proceeds" means the interview process
   isn't stuck waiting indefinitely — `ApplicationScore.interviewAverage`
   is in fact computed and kept current from 3 valid submissions onward
   (feeding Module 4's Final Ranking without waiting for a Secretariat
   action), but a panellist's own visibility into that average, and any
   further mutation of this interview's scores, stays gated until either
   the 4th panellist submits or the Secretariat explicitly closes it.
   This mirrors ADR-0015's framing: a consistent, evidence-based reading,
   not an invented one, but not confirmed against an authoritative
   programme source either.

4. **`recomputeInterviewAverage` lives in
   `modules/scoring/services/scoreAggregationService.ts`**, next to the
   existing `recomputeReviewAverage`, not in `modules/interviews` — one
   aggregation service for both halves of `ApplicationScore`, not two.
   Same shape: filter to `SUBMITTED` scores with a non-null total,
   require at least 3, round once via
   `toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)`, upsert via a new
   `upsertInterviewAverage` (a sibling of `upsertReviewAverage` that only
   ever touches interview-prefixed columns on the same row). Called
   unconditionally at the tail of `submitInterviewScore` — same
   "idempotent, cheap re-read-and-upsert after every submission" pattern
   `recomputeReviewAverage`'s own call site already uses — and again at
   the tail of `closeInterviewWithOverride`.

5. **Two new permissions**: `INTERVIEW_SCORES_VIEW_ALL` (interview-side
   counterpart of `REVIEW_SCORES_VIEW`) and
   `INTERVIEW_SCORING_CLOSE_OVERRIDE` (interview-side counterpart of
   `REVIEW_SCORES_REOPEN`, though unlike that permission this one is
   granted to Programme Secretariat, not System-Administrator-only — the
   Addendum's own text says "Programme Secretariat may invoke," a
   different, more specific instruction than the review-side reopen
   permission's unrelated §16 constraint). `INTERVIEW_SCORES_VIEW_ALL` is
   granted to `PROGRAMME_SECRETARY`, `SELECTION_COMMITTEE_MEMBER`, and
   `EXECUTIVE` — all three already exist as real, provisionable roles
   (with existing `COMMITTEE_VIEW`/`EXECUTIVE_VIEW` grants) even though
   their own feature modules (6 and 8) aren't built yet, so per
   `handoff/REMAINING_WORK.md`'s own instruction to "permission-gate now,
   consume once the UI exists," all three actor types the spec names get
   the grant now rather than only Secretariat.

6. **A new, dedicated oversight route**
   (`app/(dashboard)/interviews/scoring-oversight/[interviewId]`), gated
   purely on `INTERVIEW_SCORES_VIEW_ALL`, rather than folding this into
   `interviews/scheduling/[interviewId]` (gated on the unrelated
   `INTERVIEW_SCHEDULING_MANAGE`) or `review-operations` (a different
   domain entirely). A future Committee- or Executive-only grant of
   `INTERVIEW_SCORES_VIEW_ALL` must not imply scheduling-management
   rights those roles shouldn't have.

## Consequences

- `ApplicationScore.interviewAverage`/`interviewScoreCount` are now live
  and ready for Module 4 (Final Ranking) to consume — same status
  `docs/INTERVIEW_ASSIGNMENT_ENGINE.md`'s "Not built this module" section
  already documents for the review half via ADR-0015. That section
  should be read alongside this ADR going forward for the interview half.
- `interview.weighting_percent` (currently defaulted to 30, the
  Addendum's stated split is 40/60) is deliberately **not** touched by
  this module — that default update belongs to Module 4, which is the
  module that actually consumes the setting.
- A panellist can no longer save a draft or submit once
  `scoringOverrideAt` is set (`InterviewScoringClosedError`) — this
  closes a drift risk where a late 4th submission could silently coexist
  with an already-locked, already-computed average with nothing
  recomputing it.

## Alternatives considered

- **JSON blob or a side table for the four comment fields**: rejected —
  inconsistent with this codebase's flat-column convention everywhere
  else a fixed, known set of fields is stored.
- **Reusing `RECUSED` for the missing-panellist case**: rejected — see
  Decision §2 above; semantically wrong and operationally unused today,
  which would make repurposing it a silent trap for a future real
  recusal feature.
- **Auto-closing and revealing the average the instant 3 valid
  submissions exist, with no Secretariat action**: rejected — this
  reading would make §2.6's override action redundant with §2.5, which
  the spec's own two-section structure argues against.
- **Folding the override into `reassignPanelist`'s existing
  mandatory-reason action as one combined action**: rejected — scoring
  closure and panel reassignment are different lifecycles gated by
  different permissions (`INTERVIEW_SCORING_CLOSE_OVERRIDE` vs
  `INTERVIEW_ASSIGNMENTS_MANAGE`) with different consequences; combining
  them would blur an audit trail that should stay one action per
  business event.
