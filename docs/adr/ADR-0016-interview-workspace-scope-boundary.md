# ADR-0016: Interview Workspace scope boundary with the Interview Scoring Engine

**Status:** Accepted
**Date:** 2026-07-19
**Context:** Release 1, Module 2 (Interview Workspace)

## Context

The Release 1 overnight brief splits interview scoring across two
modules with distinct charters:

- **Module 2 (Interview Workspace)**: "Interview queue, Scheduled
  interviews, Teams/meeting placeholder, Applicant summary, Interview
  question framework, Individual scoring, Panel comments, Draft save,
  Submission, Autosave, Accessibility, Mobile responsiveness. Each
  panellist submits independently. Scores remain hidden until all four
  have submitted."
- **Module 3 (Interview Scoring Engine)**: "Configurable interview
  framework, Question weighting, Mandatory questions, Score validation,
  Automatic averaging, Tie-breaking support, Final interview score
  generation. No hard-coded scoring rules. Consume Configuration Centre
  values."

`InterviewCriterion` (the schema's pre-existing interview rubric model)
is deliberately flatter than `ReviewCriterion`: no `code`, `minScore`
(implicitly 0), `isMandatory`, `isCommentMandatory`, `allowDecimalScores`,
or `ratingScaleId`. Its own doc comment says it's "same shape/pattern as
ReviewCriterion, intentionally, so one mental model covers both" — but as
found, it isn't yet at parity. Building Module 2 required deciding how
much of that gap to close now versus leave for Module 3.

## Decision

Module 2 builds the **per-panellist** experience only: viewing an
assigned interview, scoring each active question with a plain numeric
input (no rating scale, no per-question mandatory flag), saving drafts
with autosave, and submitting independently. It computes and stores a
**per-panellist raw total** (`InterviewScore.totalScore`) using the
already-configured `weight` field on each `InterviewCriterion`, by
reusing `modules/reviews/domain/scoring.ts`'s weighted-sum primitives
directly rather than writing a parallel implementation.

Module 2 explicitly does **not**:

- Add `isMandatory`/`isCommentMandatory`/`allowDecimalScores`/
  `ratingScaleId` to `InterviewCriterion` — Module 3's "Configurable
  interview framework"/"Mandatory questions" charter.
- Require every criterion to be scored before submission — only "at
  least one score entered." Which questions are truly mandatory is
  exactly what Module 3 is asked to implement; hard-requiring every
  criterion now would invent that answer instead of leaving it open.
- Average scores across the four panellists into
  `ApplicationScore.interviewAverage`/`compositeScore`, or generate a
  final interview score — Module 3's "Automatic averaging"/"Final
  interview score generation."
- Add tie-breaking logic — Module 3's "Tie-breaking support."
- Build a "compare all panellists' scores" screen — the brief's Module 6
  (Selection Committee) explicitly owns "Compare scores" as its own
  capability.
- Add a per-criterion comment column to `InterviewScoreEntry` (it has
  `score` only, unlike `ReviewScore` which has both `score` and
  `comment`). "Panel comments" is satisfied by the existing overall
  `InterviewScore.comments` field — the same one-comment-per-submission
  shape the Reviewer Workspace's overall comment already uses, just
  without also duplicating a per-question comment box the brief never
  asked for.

"Scores remain hidden until all four have submitted" is enforced
**structurally**, not by a visibility flag: every function in
`interviewScoreService.ts` operates on the caller's own
`interviewId`/`panelistId` pairing — no function accepts another
panellist's id as an argument, so there is no code path that could ever
return another panellist's score or comment. The one piece of
cross-panellist information exposed is a non-numeric progress count
("2 of 4 submitted"), which cannot leak a score.

## Consequences

- **No schema migration for Module 2.** `InterviewScore`/
  `InterviewScoreEntry`/`InterviewCriterion` already had every field this
  module needs.
- Module 3 will need to decide, and likely migrate for: per-criterion
  mandatory/comment-required flags, a rating-scale option (or a
  documented decision that interviews never use one), and where the
  cross-panellist averaging formula and final interview score are
  computed and stored. This ADR's boundary is what makes that Module 3
  work additive rather than a rework of Module 2's read/write paths —
  `InterviewScore.totalScore` (per panellist, already computed) is a
  natural input to whatever Module 3's averaging step turns out to be.
- A panellist can currently submit a scorecard with only one question
  answered, so long as that one score is valid. This is a deliberately
  low, temporary bar — Module 3's "Mandatory questions" is expected to
  raise it via real per-criterion configuration, not this module
  guessing at a policy.

## Alternatives considered

- **Require every active criterion scored to submit** (mirroring
  Review's `allCriteriaMandatory`): rejected — there is no schema field
  or Configuration Centre setting distinguishing a truly mandatory
  interview question from an optional one yet, so "every criterion" would
  itself be an invented policy, not a read of existing configuration.
- **Add the full `ReviewCriterion` field set to `InterviewCriterion` now**
  (closing the doc comment's stated gap immediately, matching Module 1's
  own "no schema shortcuts" instruction for `InterviewPanelist`): rejected
  for this module specifically, because Module 1's gap was in a shape
  Module 1 itself needed to function correctly (reassignment history);
  here, the gap is in a shape Module 3 was *explicitly assigned* to
  build ("Configurable interview framework... Mandatory questions"). Pre-
  building it risks guessing wrong about what Module 3's Configuration
  Centre-driven design actually needs, and duplicates work the brief
  already scoped to a later module.
