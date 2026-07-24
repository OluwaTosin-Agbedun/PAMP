# Review Framework

The configurable domain model behind every scored review stage
(Application Review today; Interview and Committee Assessment can reuse
the same model in a later phase). Independent of the UI — nothing here
is a React component, Server Action, or route handler; see
[`docs/SCORING_ENGINE.md`](SCORING_ENGINE.md) for the calculation layer
and [`docs/REVIEW_LIFECYCLE.md`](REVIEW_LIFECYCLE.md) for how a `Review`
moves through it.

## The four concepts

```
ReviewStage  ──1:N──▶  ReviewFramework  ──1:N──▶  ReviewCriterion ──0:1──▶ RatingScale ──1:N──▶ RatingScaleBand
  "Application Review,      one versioned         one rubric line item        optional labeled
   worth up to 60"          rubric filling         ("Academic merit,           score bands
                             that slot              max 20, weight 1")
```

### ReviewStage

A configurable point in the selection pipeline — `prisma/schema.prisma`'s
`ReviewStage` model. Attributes: `programmeId` (required), `cohortId`
(nullable — null applies programme-wide, set scopes to one cohort's own
configuration), `name`, `code` (unique per programme+cohort),
`maxTotalScore`, `status` (`DRAFT`/`ACTIVE`/`RETIRED`), `sequenceOrder`,
`opensAt`/`closesAt`, and three policy flags:

| Flag | Meaning |
|---|---|
| `commentsRequired` | Whether `Review.comments` (the *overall* review comment) is required at submission. |
| `allCriteriaMandatory` | When `true`, every active criterion in the stage's framework is mandatory for submission regardless of its own `isMandatory` value — a stage-wide override. When `false`, each criterion's own flag governs individually. |
| `allowPartialDraft` | Reserved for a future UI-level "you can leave and come back" affordance; the domain layer already allows incomplete drafts unconditionally (§12) — this flag doesn't gate anything in the service layer today. |

No `deletedAt` — a deliberate deviation from the brief's literal attribute
list (7.1 mentions "soft-delete fields where consistent with the
schema"). This codebase's actual convention for rubric/config entities is
deactivation via a status field, not soft delete (`EligibilityCriterion`
has neither `isActive` *and* `deletedAt` — just `isActive`; see
[`docs/database.md`](database.md#9-soft-delete-strategy)). `ReviewStage`
already has a three-value `status` including `RETIRED`, which *is* that
mechanism — adding `deletedAt` on top would be a second, redundant way to
say the same thing.

### ReviewFramework

One versioned rubric implementing a stage — `DRAFT` → `PUBLISHED` →
`RETIRED`, never edited in place once `PUBLISHED`. `version` is a plain
incrementing integer per stage (`(reviewStageId, version)` unique);
`programmeId`/`cohortId` are denormalized from the stage at creation
time, the same "written once, never independently updated" pattern
`Application.cohortId` already uses.

**Publishing a new version automatically retires whichever version was
previously `PUBLISHED` for the same stage** (a service-level rule in
`publishReviewFramework`, not a database constraint) — the brief doesn't
specify whether multiple simultaneously-published versions should be
allowed, and leaving that ambiguous would make "the active framework for
this stage" an ill-defined question for `createReview` to answer. See
`modules/reviews/services/frameworkService.ts`'s doc comment on
`publishReviewFramework` for the full rationale.

`totalConfiguredScore` is computed once, at publish time (sum of
`maxScore × weight` across active criteria — see
[`docs/SCORE_CALCULATION_RULES.md`](SCORE_CALCULATION_RULES.md)), and
cached on the row. It is never recomputed after that — a published
framework's criteria can't change, so there's nothing for it to drift
against.

### ReviewCriterion

One rubric line item. Belongs to exactly one `ReviewFramework`
(`reviewFrameworkId`, `onDelete: Cascade` — a framework's criteria don't
outlive the framework). `code` is unique within the framework (not
globally — the same code, e.g. `"ACADEMIC_MERIT"`, can appear in every
version of a stage's framework, since each version is its own row).

| Field | Purpose |
|---|---|
| `minScore`, `maxScore` | The valid range for a raw score on this criterion. |
| `weight` | Multiplier applied to the raw score when computing this criterion's contribution to the total (default `1` — see [`docs/SCORE_CALCULATION_RULES.md`](SCORE_CALCULATION_RULES.md) for why this is how "unweighted" is expressed, not a separate code path). |
| `isMandatory` | Whether this criterion must be scored before the *review* can submit — subject to the stage's `allCriteriaMandatory` override. |
| `isCommentMandatory` | Whether a comment is required on *this criterion's score* at submission. |
| `allowDecimalScores` | `false` restricts scores to whole numbers. |
| `reviewerGuidance`, `evidenceGuidance` | Free text shown to a reviewer scoring this criterion (once a Reviewer Workspace exists — see [`docs/PHASE_3A_IMPLEMENTATION_REPORT.md`](PHASE_3A_IMPLEMENTATION_REPORT.md) for why that UI is out of scope this phase). |
| `ratingScaleId` | Optional — when set, a score must match one of the scale's band values exactly rather than being any value in `[minScore, maxScore]`. |
| `isActive` | Only has effect while the framework is `DRAFT` — a criterion can't be individually retired from a published framework (the whole framework version is superseded instead; see `docs/REVIEW_LIFECYCLE.md`'s locking section). |

`isActive` deactivates without deleting — same pattern as
`EligibilityCriterion`/the original `ReviewCriterion`. A criterion used
in a submitted review's `ReviewScore` rows stays fully retrievable
forever, whether or not it's still active or its framework is still
published (`tests/integration/reviewFramework.test.ts`'s "historical
criteria remain retrievable after their framework is retired" test).

### RatingScale / RatingScaleBand

A reusable, named set of labeled score bands (e.g. `1 = "Does not meet
expectations"` … `5 = "Exceptional"`), scoped to a framework — not
global — so it's frozen the same way criteria are once the framework
publishes. Not every criterion uses one: `ReviewCriterion.ratingScaleId`
is nullable, for a direct-entry score instead. Publish validation
rejects a band value outside its criterion's `[minScore, maxScore]`
range, and a criterion referencing a scale with zero bands (§8).

## Framework validation (publish gate)

`modules/reviews/domain/frameworkValidation.ts`'s
`validateFrameworkForPublish` — pure, no I/O, returns every violation at
once rather than stopping at the first (`FrameworkValidationResult`).
Checked, in order:

1. Framework is `DRAFT` (not already published/retired).
2. Framework's `programmeId`/`cohortId` match its stage's (defensive —
   should always hold structurally).
3. At least one active criterion exists.
4. No duplicate criterion codes among active criteria.
5. Each criterion: non-negative display order, `minScore ≤ maxScore`,
   `maxScore > 0`, `weight > 0`.
6. Each mandatory criterion has non-empty `reviewerGuidance` — an
   interpretation, not something an authoritative document specifies (no
   such document exists in this repository — see
   [`docs/PHASE_3A_IMPLEMENTATION_REPORT.md`](PHASE_3A_IMPLEMENTATION_REPORT.md)
   §14); the reasoning is that a reviewer shouldn't be required to score
   something with no guidance on how to score it.
7. Each criterion referencing a rating scale: the scale has at least one
   band, and every band's value falls within the criterion's
   `[minScore, maxScore]`.
8. The configured total (sum of `maxScore × weight` over active
   criteria) exactly equals the stage's `maxTotalScore`.

`InvalidReviewFrameworkError` is thrown by the publish service with
every violation's message joined together — the caller sees the whole
list, not just the first problem, on one attempt.

## What's deliberately not built this phase

No admin UI for any of this (§24: "Do not build a complete review
administration interface"). Every function in
`modules/reviews/services/frameworkService.ts` is what a future admin
screen's Server Actions would call directly — the service boundary
already has the permission checks, validation, transactions, and audit
logging a Server Action would otherwise have to duplicate — but nothing
is wired to a route yet. Verified via the Vitest integration suite
(`tests/integration/reviewFramework.test.ts`) instead, per §24's explicit
preference for tests over premature UI.
