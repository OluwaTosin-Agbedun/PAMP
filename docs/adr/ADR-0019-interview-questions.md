# ADR-0019: Interview Questions (Addendum Module 3)

**Status:** Accepted
**Date:** 2026-07-21
**Context:** Enterprise Functional Specification Addendum, Module 3 (Interview Questions)

## Context

`InterviewQuestion` existed in the schema since the original Phase 1 migration —
`id, cohortId, text, order, isActive` — but nothing ever wrote to it: no admin UI, no
service, no seed data, confirmed empty in every environment. The Addendum's §3 gives it
a real brief: a "hybrid questioning model" of mandatory questions (every applicant,
cannot be skipped), pathway questions (auto-displayed for a matching applicant, three
named pathways), and additional questions (panellists pick from an approved bank only,
never ad hoc), plus provenance tracking (every question asked, who selected each
additional one, session start/end time).

This module also had to resolve a question left open by ADR-0016 (Interview Workspace,
Release 1 Module 2): whether "questions" panellists interact with are the same thing as
`InterviewCriterion` (the scoring rubric that module built). They are not — the schema's
own doc comment on `InterviewQuestion` already settled this: *"Free-standing (not linked
to InterviewScoreEntry) — panelists score against InterviewCriterion competencies, not
per-question; questions are a shared prompt sheet, not a per-response record."* This ADR
treats that as the starting precedent, not a new decision.

## Decision

1. **`InterviewQuestion.category`** (new enum: `MANDATORY | PATHWAY | ADDITIONAL_BANK`)
   distinguishes the three buckets on the existing table, rather than three separate
   tables — matches `handoff/REMAINING_WORK.md`'s own suggested shape.

2. **`InterviewQuestion.pathway`** is a **real Prisma enum**
   (`InterviewPathway`: `ENTREPRENEURSHIP_ENTERPRISE`, `PUBLIC_PRIVATE_SECTOR_LEADERSHIP`,
   `ACADEMIA_ADVANCED_STUDIES`), not free text — even though `Application.pathway` (the
   applicant-facing field, populated by Excel/CSV import) stays exactly as unconstrained
   as it already was. These are different problems: `Application.pathway` is data this
   module doesn't own or control; a `PATHWAY`-category question's pathway is
   admin-authored data this module fully owns, so it gets compile-time exhaustiveness
   rather than importing the applicant-side data-quality problem into a place that
   doesn't need it. Matching an application's free-text pathway string against this enum
   happens once, at read time (`modules/interviews/domain/interviewQuestions.ts`'s
   `matchApplicationPathway`, trimmed/case-insensitive) — an unrecognized or missing
   pathway simply means zero pathway questions display, never an error.

3. **No scoring integration.** `InterviewQuestion` stays free-standing from
   `InterviewCriterion`/`InterviewScoreEntry`, per the pre-existing schema comment.
   Panellists see the question framework as reference context alongside the (unchanged)
   scoring form; nothing about this module changes how a score is calculated.

4. **Historical-integrity partial lock**: once a question has ≥1 `InterviewQuestionAsked`
   row, its `text`/`category`/`pathway` become immutable (service-layer rejection,
   `ConflictError`); `isActive`/`order` stay freely editable, since neither affects what
   was historically asked. This is a genuinely new pattern in this codebase — not a
   direct copy of an existing one. The two closest analogs both do something different:
   `ReviewCriterion` locks completely once its `ReviewFramework` is `PUBLISHED` (no
   partial editability); `EligibilityCriterion` never locks at all. This module's
   in-between shape exists because `InterviewQuestion` has no publish/version lifecycle
   to hook a full lock onto, but the Addendum's provenance requirement ("record every
   question asked") would be undermined if a question's text could be silently rewritten
   after it was actually asked in a real interview. There is deliberately **no delete
   endpoint at all** for `InterviewQuestion` — matching `EligibilityCriterion`'s
   create-plus-toggle-only precedent — which alone satisfies "must not be physically
   deleted."

5. **Session actions get a new permission**, `INTERVIEW_SESSION_MANAGE` (start/end the
   session, select an additional question), granted to `Role.INTERVIEWER` — a new
   fine-grained permission per new panellist-facing capability, the same pattern both
   prior Addendum modules used (`INTERVIEW_AVAILABILITY_MANAGE`,
   `INTERVIEW_CONFLICTS_DECLARE`), rather than folding this into the existing
   `INTERVIEWS_SCORE`. Bank management gets its own permission,
   `INTERVIEW_QUESTIONS_MANAGE`, placed in the `PROGRAMME_OVERSIGHT` array (Director +
   Admin) — the same placement as `ELIGIBILITY_MANAGE_CRITERIA`, since "configuring the
   rules governing the process" is consistently Director/Admin territory in this
   codebase, distinct from Programme Secretariat's day-to-day operator permissions.

6. **No chair-only restriction.** `InterviewPanelist.isChair` is confirmed decorative
   elsewhere in this codebase (`docs/INTERVIEW_ASSIGNMENT_ENGINE.md` — no
   chair-selection behavior was ever specified) — session actions are available to any
   active panellist, self-attributed via their own id, for resilience.

7. **Concurrency follows the codebase's one established pattern exactly**: status-
   conditioned `updateMany` (only succeeds if `actualStartedAt`/`actualEndedAt` is still
   `null`), throwing `ReviewConcurrencyError` on `count === 0` — the same pattern and
   the same reused error class every other optimistic-concurrency guard in this codebase
   uses (`updateScoreStatus`, `applyScoringOverride`, `updatePanelistStatus`, and others).
   No silent no-op was considered for the "double start" case — every existing guard in
   this codebase throws without exception, and this module doesn't introduce the first
   deviation from that.

## Consequences

- `InterviewQuestion`/`InterviewQuestionAsked` are now live, giving Module 6 (Final
  Selection Committee, which needs "interview comments... leadership pathway
  suitability" per the tie-breaking cascade) and any future reporting a real provenance
  record of what was actually asked and by whom.
- `interview.weighting_percent` and any scoring math are untouched — this module is
  purely additive to the interview workflow's question-and-answer surface, not its
  scoring surface.
- Pre-existing UI copy in the Interview Workspace that said "questions" while actually
  meaning `InterviewCriterion` rows (`app/(dashboard)/interviews/[interviewId]/page.tsx`,
  `scoring-form.tsx`) was renamed to "criteria" as part of this module, to remove the
  terminology collision with the real question framework this module adds to the same
  page.

## Alternatives considered

- **A separate table per category** (`MandatoryQuestion`, `PathwayQuestion`,
  `AdditionalBankQuestion`): rejected — three tables with identical shape and no
  category-specific fields would be pure duplication; the single enum column expresses
  the same distinction with one model, matching `REMAINING_WORK.md`'s own suggestion.
- **`InterviewQuestion.pathway` as free text**, matching `Application.pathway`'s shape:
  rejected — see Decision §2; conflates a data-quality problem this module doesn't own
  with data this module fully authors and controls.
- **Full version/publish lifecycle for `InterviewQuestion`**, mirroring
  `ReviewFramework`: rejected as unnecessary complexity — the Addendum's brief for this
  module has no versioning or draft-approval language, unlike the review framework's own
  brief did.
- **Folding session actions into `INTERVIEWS_SCORE`**: rejected — see Decision §5;
  inconsistent with the fine-grained-permission-per-capability pattern both prior
  Addendum modules established.
