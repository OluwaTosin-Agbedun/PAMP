# Eligibility QA Governance

This is the real, current path an Eligibility Reviewer's flagged case
is resolved through — not an advisory or legacy flow. History: an
earlier revision of this document called it "superseded" while the
PAM-P 2026 Eligibility Screening Checklist made `ELIGIBILITY_REVIEWER`
a full screener (`ELIGIBILITY_SCREENING_PERFORM`, deciding cases
directly). That was deliberately reverted: `ELIGIBILITY_REVIEWER` no
longer holds `ELIGIBILITY_SCREENING_PERFORM` at all
(`lib/permissions/rolePermissions.ts`) — recommend-only is the intended
model, matching the brief's "Eligibility QA Reviewers must not
directly change an applicant's eligibility status." Only the Programme
Secretariat (`eligibility_override.execute`) may actually change
`EligibilityScreening.status`/`Application.eligibilityStatus`.

**Fixed alongside the revert**: `createRecommendation` used to read
`EligibilityDecision`, a model nothing has written to since the old
`modules/eligibility/engine.ts` was deleted — meaning flagging a case
was silently broken (always threw `NotFoundError`) for the entire time
`ELIGIBILITY_REVIEWER` could bypass it via direct screening anyway. It
now reads the real decision source of truth,
`EligibilityScreening.status`, and `executeOverride` now writes both
`EligibilityScreening` (`decidedById`, `decidedAt`, `status`,
`reasonForDecision` — the same shape `recordDecision` in
`screeningRepository.ts` writes) and `Application.eligibilityStatus`
together, so the screening workspace and the applicant record can
never quietly disagree about the current outcome the way the old
single-field write could.

## The model

**Eligibility screening is automatic first**
(`modules/eligibility/automaticDecision.ts` /
`screeningService.ts::runAutomaticEligibilityDecision`, see
[ELIGIBILITY_SCREENING.md](ELIGIBILITY_SCREENING.md)), randomly
assigned to one of the Eligibility Reviewers the moment it can't
decide on its own (`modules/eligibility/reviewerAssignment.ts`).
`ELIGIBILITY_REVIEWER` has exactly one write action on that case: flag
it as questionable and recommend a different outcome — most often
while it's sitting `CLARIFICATION_REQUIRED`, not only once it's
already terminal.

| Capability | `ELIGIBILITY_REVIEWER` | `PROGRAMME_SECRETARY` |
|---|---|---|
| View eligibility decisions | Yes (`eligibility.review`, unchanged) | Yes |
| Review automated outcomes | Yes | Yes |
| Flag a questionable case | Yes (`eligibility_recommendations.create`) | No — not this role's job |
| Recommend an override | Yes | No |
| **Execute** an approved override | **No** | **Yes** (`eligibility_override.execute`) |
| Approve/reject an applicant directly | No | No |
| Edit applicant data | No | No |
| Change eligibility result directly | No | Only via executing a recommendation |

The reviewer who raises a recommendation can never execute it — enforced
by permission, not convention: `executeOverride`/`dismissRecommendation`
(`modules/eligibilityQa/services/recommendationService.ts`) both require
`eligibility_override.execute`, which `ELIGIBILITY_REVIEWER`'s
permission set does not include (confirmed by
`tests/integration/release1_5Governance.test.ts`'s "the Eligibility
Reviewer who raised a recommendation cannot execute it themselves"
test — an actual attempted call, rejected, not a permission-list
assertion).

## Data model

`EligibilityRecommendation` (new, Release 1.5):

- `applicationId`, `raisedById` — who flagged what.
- `currentIsEligible` — the automated engine's result at flag time,
  captured so the record stays meaningful even if the application's
  status later changes for an unrelated reason.
- `recommendedIsEligible`, `reason` — what the reviewer thinks should
  happen, and why.
- `status`: `PENDING` → `EXECUTED` or `DISMISSED`.
- `executedById`, `executedAt`, `executionNote` — who resolved it, when,
  and any note (e.g. "confirmed against submitted transcript").

## What executing an override actually does

`recommendationService.executeOverride` (via
`recommendationRepository.executeOverrideDecision`) writes the
recommended outcome to **both** `EligibilityScreening` (`status`,
`nextAction`, `reasonForDecision`, `decidedById` = the executing
Secretariat account, `decidedAt`) and `Application.eligibilityStatus`
— the same two records `recordDecision` in `screeningRepository.ts`
keeps in sync for every other decision path. It deliberately does
**not** touch `Application.stage` — the automatic engine's own
eligibility-decision path updates both fields together, but it only
ever runs once, immediately after import, before any review activity
exists. An override can be executed at any later point (an application
could already have reviewers assigned), so cascading into a stage
reset here could silently undo unrelated progress. **Known
limitation**, documented rather than guessed around: an override
changes eligibility status only; if an application's stage needs to
change as a consequence (e.g. an application overridden to ineligible
after reviews were already assigned), that's a separate, manual
Secretariat action today.

Dismissing a recommendation (`dismissRecommendation`) changes nothing on
the `Application` — only the recommendation's own `status`.

## Where it lives in the UI

- **Flagging and viewing recommendations**: the Applicant Detail page
  (`app/(dashboard)/applicants/[id]/eligibility-qa-card.tsx`) — the same
  page that already shows the automated decision's reasons. An
  Eligibility Reviewer sees a "Flag this outcome" form; a Programme
  Secretariat account additionally sees "Execute override"/"Dismiss"
  controls on any `PENDING` recommendation.
- **Triage queue**: `/eligibility-recommendations`
  (`eligibility_override.execute`-gated), listing every `PENDING`
  recommendation across the cohort, linking to each application's
  detail page to act on it — so a Secretary doesn't have to discover
  flagged cases by stumbling onto individual applicant pages.

## Audit trail

Every step writes its own audit action:
`ELIGIBILITY_RECOMMENDATION_CREATED`, `ELIGIBILITY_OVERRIDE_EXECUTED`,
`ELIGIBILITY_RECOMMENDATION_DISMISSED` — distinguishable in the Audit
Trail without inspecting metadata, per the brief's "every recommendation
and override must be fully audited."

## Testing

`tests/integration/release1_5Governance.test.ts`: a reviewer creating a
recommendation; a wrong role (`APPLICATION_REVIEWER`) denied; the
raising reviewer denied execution of their own recommendation; a
Secretary executing an override and `Application.eligibilityStatus`
actually flipping (with the audit row confirmed); a double-resolve
rejected (`ConflictError`); a dismissal leaving `eligibilityStatus`
untouched; the pending queue listing correctly and denying non-
Secretariat access.
