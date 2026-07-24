# Eligibility Screening Checklist

Implements the PAM-P 2026 Eligibility Screening Checklist. This module
went through two distinct fixes:

1. **The vacuous-pass bug (original fix).** The old automatic engine
   (`modules/eligibility/engine.ts`, since deleted) evaluated
   `criteria.every(...)`, which is vacuously `true` on an empty array —
   and no cohort ever had an `EligibilityCriterion` configured, so
   every imported application passed automatically, with no human
   involved. The fix made a human screener working through the 22-item
   checklist below the only authority: import stopped calling the
   automatic engine at all, and every imported application landed at
   `PENDING_SCREENING` with no default decision.
2. **The PAM-P Application Eligibility Criteria engine (current
   behaviour).** The Secretariat supplied an explicit, written
   eligibility policy (citizenship, qualification, NYSC status, the
   five-year rule, document completeness, pathway selection, deadline,
   duplicate/integrity checks). Unlike the deleted engine, this one
   evaluates real structured applicant/document data against that
   policy and is authoritative — see "Automatic decision engine"
   below. It replaces the old `/eligibility-criteria` admin
   configuration page (also deleted, along with
   `modules/eligibility/fields.ts` and `modules/eligibility/service
   .ts`): criteria are no longer rows an admin configures, they're the
   fixed policy this engine implements. A human screener (or an admin
   overriding by hand) remains fully in the loop for anything the
   engine can't verify — see below.

See also [ELIGIBILITY_QA_GOVERNANCE.md](ELIGIBILITY_QA_GOVERNANCE.md)
for how the pre-existing recommendation/override module
(`modules/eligibilityQa/`) fits alongside this.

## Automatic decision engine

`modules/eligibility/automaticDecision.ts`'s `decideAutomaticEligibility`
is called once per application, immediately after import
(`modules/import/service.ts`), and in bulk via
`runAutomaticEligibilityForCohort` (the "Run automatic eligibility
screening" button on `/eligibility-screening`) for applications
imported before this engine existed. It:

1. Refreshes the automatic pre-checks (below) for every checklist item.
2. Gates on 13 checklist items with a real automatic evaluator —
   Nigerian citizen, NYSC status, the five-year rule, programme
   availability, submission deadline, and the 8 required documents —
   plus the exact-match duplicate check (mapped to `DISQUALIFIED`,
   stricter than a plain `FAIL`).
3. **Deliberately excludes** every item that requires genuine human
   judgement — Minimum Qualification, Leadership Potential, Ethical
   Orientation, Name/Date Consistency, Document Readability, Possible
   Alteration, Written Response Authenticity — from the automatic
   gate. Any of these left unresolved routes the outcome to
   `CLARIFICATION_REQUIRED`, never a fabricated `PASS`. This is a
   deliberate honesty boundary, not an oversight: there is no
   automatic evaluator for "does this CV demonstrate leadership
   potential," so the engine never pretends to have one.
4. Writes the outcome via the same `recordDecision` path a human
   screener uses (`decidedById: null` marks it system-decided), sends
   the applicant the same notification a human decision would, and —
   on `ELIGIBLE` — advances `stage` and auto-assigns reviewers exactly
   like `markEligible` does.
5. **Never touches an already-confirmed screening** —
   `ELIGIBLE`/`INELIGIBLE`/`DISQUALIFIED` is a terminal state the
   engine skips on every subsequent run, so re-running it (including
   the bulk cohort run) is always safe.

A human with `ELIGIBILITY_SCREENING_PERFORM`/`_DISQUALIFY` can still
override any outcome — automatic or human — by hand through
`markEligible`/`markIneligible`/`markDisqualified`/
`requestClarification`, exactly as before; the engine only replaces
the step of a human walking the checklist for the *first* pass.

## The checklist

`modules/eligibility/checklistDefinition.ts` defines 22 fixed items in
three sections (not database-configurable — code-defined, like the
rest of this codebase's "central catalogue, not rows" pattern, see
`docs/RBAC.md`):

- **Required Documents** (8, Pass/Fail/Clarify): CV, Degree Certificate,
  NYSC Evidence, Valid ID Card, Passport Photograph, Personal
  Statement, Motivation for Applying, Leadership Pathway Selection.
- **Baseline Eligibility** (8, Pass/Fail/Clarify): Nigerian Citizen,
  Minimum Qualification, NYSC Status, Five-Year Rule, Leadership
  Potential, Ethical Orientation, Programme Availability, Submitted
  Within Deadline.
- **Consistency / Integrity** (6, Clear/Flag/Clarify): Name
  Consistency, Date Consistency, Document Readability, Possible
  Alteration, Duplicate Application, Written Response Authenticity.

Each row (`EligibilityChecklistItem`) carries a status, an optional
comment, and `isAutomatic` — `true` for a system-suggested value the
screener hasn't touched yet, `false` the moment a screener saves over
it. A screener-entered value is never silently overwritten:
`refreshAutomaticPreChecks` (`screeningService.ts`) only ever writes to
a row that doesn't exist yet or is still `isAutomatic: true`.

**Automatic pre-checks** (`modules/eligibility/automaticPreChecks.ts`)
suggest a status for items a computer can reasonably judge — a matching
uploaded document, a declared NYSC status, the five-year rule
(`fiveYearRule.ts`, exact date arithmetic, not year subtraction), the
cohort's own application deadline, an exact-match duplicate. Items that
require genuine human judgement (Minimum Qualification, Leadership
Potential, Ethical Orientation, Name/Date Consistency, Document
Readability, Possible Alteration, Written Response Authenticity) are
never auto-suggested — they return `null` and stay blank until a
screener enters one. Nationality never auto-fails: an unrecognised or
non-Nigerian declaration suggests `CLARIFY`, never `FAIL`, since it may
still be resolvable (e.g. dual citizenship, naturalisation in
progress).

`canMarkEligible` (`checklistValidation.ts`) requires all 22 items
resolved to `PASS`/`CLEAR` before `markEligible` will succeed — a
partially-completed or CLARIFY/FAIL-containing checklist can never
produce an eligible outcome.

## The four decisions

Each of the four decisions can be reached two ways: the automatic
engine above (`decidedById: null`), or a human acting directly through
the endpoints below. Both paths call the same `recordDecision`.

| Decision | Who (human path) | Effect |
|---|---|---|
| **Eligible** | `ELIGIBILITY_SCREENING_PERFORM` | Requires every checklist item `PASS`/`CLEAR`. Sets `Application.eligibilityStatus = ELIGIBLE`, `stage = UNDER_REVIEW`; optionally triggers automatic reviewer assignment (`SETTINGS_KEYS.AUTOMATIC_ASSIGNMENT_ENABLED`). Optionally flags `secondReviewRequired`. |
| **Clarification Required** | `ELIGIBILITY_SCREENING_PERFORM` | No checklist requirement. Sets `Application.eligibilityStatus = CLARIFICATION_REQUIRED`. `resolveClarification` returns it to `PENDING`/`IN_PROGRESS` once answered. |
| **Ineligible** | `ELIGIBILITY_SCREENING_PERFORM` | No checklist requirement — a screener can reject at any point once the reason is clear. Sets `Application.eligibilityStatus = INELIGIBLE`. |
| **Disqualified** | `ELIGIBILITY_SCREENING_DISQUALIFY` (stricter — Programme Secretariat/Director/Admin only, never a plain screener) | Requires an integrity note. Sets `Application.eligibilityStatus = DISQUALIFIED`. |

**Escalate** is a fifth action available to any screener
(`ELIGIBILITY_SCREENING_PERFORM`) that raises the screening's status to
`ESCALATED` without deciding eligibility — `Application.eligibilityStatus`
stays `PENDING`.

Once a decision is `ELIGIBLE`/`INELIGIBLE`/`DISQUALIFIED`, the screening
is locked (`assertScreeningEditable`) — no further checklist edits or
new decisions until `reopenScreening` (System Administrator only,
`ELIGIBILITY_SCREENING_REOPEN`) resets it to `IN_PROGRESS` and the
application back to `PENDING`, recording who reopened it and why.

**Second review**: a screener may flag their own Eligible decision as
requiring a second review. Anyone else holding
`ELIGIBILITY_SCREENING_SECOND_REVIEW` may complete it —
`performSecondReview` explicitly rejects the original screener
reviewing their own decision.

## Clarification deadline

Every time a screening enters `CLARIFICATION_REQUIRED` — via a human's
`requestClarification` or the automatic engine's own branch above —
`EligibilityScreening.clarificationDeadlineAt` is set to now plus
`eligibility.clarification_deadline_hours` (Configuration Centre →
Eligibility Screening Configuration; PAM-P 2026 default: 24 hours). The
deadline is cleared (`null`) the moment the screening leaves
Clarification Required by any path — `resolveClarification`, `escalate`,
or any of the four decisions via `recordDecision` — so it never lingers
stale against a case that's since moved on.

`checkMissedClarificationDeadlines` (`modules/eligibility/screeningService
.ts`), wired into `app/api/cron/process-notifications` alongside the
existing interview-reminder scan, is triggered by the same external
scheduler on the same interval (see docs/NOTIFICATIONS.md). Every
screening still `CLARIFICATION_REQUIRED` past its deadline is
auto-marked `INELIGIBLE` with `reasonForDecision: "Clarification
deadline missed"` (`decidedById: null`, matching the automatic engine's
own system-decided convention), notifies the applicant (reusing the
`INELIGIBLE` notification event), and writes an
`ELIGIBILITY_CLARIFICATION_DEADLINE_MISSED` audit row. Naturally
idempotent — a screening the job just decided no longer matches its own
`CLARIFICATION_REQUIRED` selection criteria, so a later run can never
process it twice.

A Programme Secretariat account (`ELIGIBILITY_SCREENING_EXTEND_DEADLINE`
— the same tier as Disqualify/Override Execute, not the general perform
permission every screener holds) can extend an individual application's
deadline with a mandatory reason via `extendClarificationDeadline`,
available on the screening detail page whenever a case is awaiting
clarification. The extension always grants a fresh full window from
*now*, not from the current deadline, so extending an already-missed
deadline doesn't hand back one that's still expired. Every extension is
audited (`ELIGIBILITY_CLARIFICATION_DEADLINE_EXTENDED`) with the
previous and new deadline and the reason given.

## Screener assignment

`assignScreener` (`ELIGIBILITY_SCREENING_ASSIGN`) only accepts a real,
`ACTIVE` user account that holds `ELIGIBILITY_SCREENING_PERFORM` —
checked against `permissionsForRole`, never a hard-coded name, even
though the checklist document itself names three screeners (Chinaza
Igwe, Ijeoma Achebe, Blessed Oladiran). Those three — or anyone else —
must exist as real accounts with an appropriate role
(`ELIGIBILITY_REVIEWER` or `PROGRAMME_SECRETARY`) to be assignable; the
system enforces the permission, not the name.

## Random reviewer assignment

`modules/eligibility/reviewerAssignment.ts` — the automatic decision
engine's `CLARIFICATION_REQUIRED` branch assigns a screener the moment
it flags a case, so nothing sits Unassigned waiting for a human to
notice it. Same "the system enforces the [role], not the name"
discipline as `assignScreener` above, but deliberately scoped to the
dedicated `ELIGIBILITY_REVIEWER` role specifically, not the broader
`ELIGIBILITY_SCREENING_PERFORM` permission — that permission is also
granted to Programme Secretary/Director/System Administrator for
oversight (they can perform a screening by hand if needed), but
they're not "the reviewers" the random pool should draw from.
`getEligibleReviewerPool` reads every `ACTIVE` account holding the
role at assignment time, not a fixed list, so granting or revoking the
role changes who future assignments can land on with no code change.
`pickRandomReviewer` is a uniform random draw over that pool.

- **Automatic**: fires inline inside `runAutomaticEligibilityDecision`
  — every future import and automatic-engine run assigns a reviewer to
  any case it can't decide.
- **On demand**: the "Randomly assign reviewers" button on
  `/eligibility-screening` (`ELIGIBILITY_SCREENING_ASSIGN`) backfills
  any screening that still needs a human (not yet
  `ELIGIBLE`/`INELIGIBLE`/`DISQUALIFIED`) and has no reviewer yet —
  applications imported before this existed, or left over from a pool
  change.
- **Idempotent**: `assignScreenerIfUnassigned`
  (`screeningRepository.ts`) only ever writes when `screenerId` is
  still `null`. The automatic engine's own top-level guard only skips
  fully-decided screenings, not `CLARIFICATION_REQUIRED` ones, so this
  guard is what actually stops a re-run from reshuffling who's already
  working a case.
- **Never assigns a decided case**: `ELIGIBLE`/`INELIGIBLE`/`DISQUALIFIED`
  are terminal — nobody further needs to "review" a case the engine
  (or a human) already finished.

## Duplicate detection

`modules/eligibility/duplicateDetection.ts`'s `findExactDuplicates`
matches on exact email, phone, or government ID number only —
deliberately no fuzzy name matching, per the checklist's own "careful
matching to avoid flagging unrelated applicants with similar names." A
match auto-suggests `FLAG` on the Duplicate Application integrity item
and surfaces a warning banner on the screening workspace.
`resolveDuplicate` lets a screener record which application is
retained and which is the duplicate (`duplicateOfId`), without ever
deleting either record.

## Diversity fields

`gender`, `stateOfOrigin`, and the selected pathway are displayed
read-only on the screening workspace for context — they are never read
by `canMarkEligible`, `evaluateBaselineItem`, or any other eligibility
computation. Nothing in this module can make a decision turn on them.

## Data remediation

`prisma/remediateEligibility.ts` (`npm run db:remediate-eligibility`)
is the one-time fix for applications the old vacuous-pass engine had
already marked `ELIGIBLE`/`INELIGIBLE` with no real human decision
behind them. It **never mass-marks anyone Ineligible** — it only resets
`eligibilityStatus` back to `PENDING` (and `stage` back to `IMPORTED`
if it had advanced to `UNDER_REVIEW`) and ensures an
`EligibilityScreening` row exists, ready for a real screener to work
through. It only ever touches an application whose screening is
missing or whose `decidedById` is still null — a genuine, screener-
confirmed decision is never touched, and re-running it is a no-op
(`ELIGIBILITY_REMEDIATED` audit row per application touched). Run
against the real PAM-P 2026 cohort: 660 applications remediated on
first run, 0 on every run since.

## Where it lives in the UI

- **`/eligibility-screening`** — the queue, filterable by status and
  screener, gated on `ELIGIBILITY_SCREENING_VIEW`. Includes "Run
  automatic eligibility screening" and "Randomly assign reviewers"
  (both `ELIGIBILITY_SCREENING_ASSIGN`) to bulk-run the engine, and to
  backfill reviewer assignment, against every application still
  awaiting one.
- **`/eligibility-screening/[applicationId]`** — the workspace: the
  three checklist sections, the duplicate warning (if any), screener
  assignment, the decision panel, and the read-only diversity card.
- **`/applicants/[id]`** — the applicant record's "Eligibility
  decision" card summarises the current `EligibilityScreening` (status,
  reason, outstanding clarification, integrity note) with a link
  through to the full checklist above.

## Audit trail

Every write has its own action:
`ELIGIBILITY_SCREENER_ASSIGNED`/`_REASSIGNED`,
`ELIGIBILITY_CHECKLIST_ITEM_UPDATED`, `ELIGIBILITY_INTEGRITY_FLAGGED`
(specifically when an integrity item is marked `FLAG`),
`ELIGIBILITY_MARKED_ELIGIBLE`, `ELIGIBILITY_PROGRESSED_TO_REVIEW`,
`ELIGIBILITY_CLARIFICATION_REQUESTED`/`_RESOLVED`,
`ELIGIBILITY_MARKED_INELIGIBLE`, `ELIGIBILITY_MARKED_DISQUALIFIED`,
`ELIGIBILITY_ESCALATED`, `ELIGIBILITY_SECOND_REVIEW_COMPLETED`,
`ELIGIBILITY_SCREENING_REOPENED`, `ELIGIBILITY_DUPLICATE_DETECTED`/
`_RESOLVED`, `ELIGIBILITY_REMEDIATED`,
`ELIGIBILITY_CLARIFICATION_DEADLINE_EXTENDED`/`_MISSED`, and the automatic engine's own
`ELIGIBILITY_AUTOMATIC_CHECK_PERFORMED` — written per application with
`authoritative: true` and the outcome/reason/failed/clarify items in
its metadata, and once per bulk cohort run
(`entityType: "Cohort"`, `outcome: "BULK_RUN_AUTHORITATIVE"`).

Government ID numbers are excluded from every audit metadata payload
and from duplicate-match logging beyond a boolean match — never
written to the audit trail in full.

## Testing

- `tests/unit/eligibilityFiveYearRule.test.ts`,
  `eligibilityAutomaticPreChecks.test.ts`,
  `eligibilityChecklistValidation.test.ts` — pure-function coverage of
  the date rule, pre-check suggestions, and the "every item resolved"
  gate.
- `tests/unit/eligibilityAutomaticDecision.test.ts` — pure-function
  coverage of `decideAutomaticEligibility`'s four outcome branches
  (ELIGIBLE/INELIGIBLE/DISQUALIFIED/CLARIFICATION_REQUIRED) and its
  excluded-items boundary.
- `tests/integration/eligibilityScreening.test.ts` — the full workflow
  against real Postgres, including the regression test that proves the
  original vacuous-pass bug stays fixed: an application with no
  supporting data run through `runAutomaticEligibilityDecision` is
  flagged `CLARIFICATION_REQUIRED`, never auto-marked `ELIGIBLE`.
- `tests/unit/reviewerAssignment.test.ts` — `pickRandomReviewer`'s
  edge cases (empty pool, single candidate, uses the whole pool over
  many draws).
- `tests/integration/reviewerAssignment.test.ts` — against real
  Postgres: assignment draws from the real permission-holder pool,
  never reassigns an already-assigned screening, the automatic engine
  never leaves a `CLARIFICATION_REQUIRED` case Unassigned, bulk
  cohort assignment fills only unassigned not-yet-decided screenings.
