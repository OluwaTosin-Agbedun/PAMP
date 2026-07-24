# Remaining work — Enterprise Functional Specification Addendum

Modules 4–9 of `handoff/ENTERPRISE_FUNCTIONAL_SPECIFICATION_ADDENDUM.md`.
Module 1 (Interview Scheduling) is done (`36fef5a`) — see
`docs/INTERVIEW_SCHEDULING.md`. Module 2 (Interview Scoring revision,
task #93) is done — see `docs/INTERVIEW_SCORING_REVISION.md` and
[ADR-0018](../docs/adr/ADR-0018-interview-scoring-revision.md);
`ApplicationScore.interviewAverage`/`interviewScoreCount` are now live,
which Module 4 (Final Ranking) below depends on. Module 3 (Interview
Questions, task #94) is done — see `docs/INTERVIEW_QUESTIONS.md` and
[ADR-0019](../docs/adr/ADR-0019-interview-questions.md);
`InterviewQuestion`/`InterviewQuestionAsked` are now live. Work through
the rest **in this order**; later modules depend on earlier ones
(Ranking feeds Committee; Committee feeds Reserve List and Offer
Management; Audit is a sweep across everything once it all exists).

Each item below is a full module in the same sense Modules 1–2 were:
schema (if needed) → domain → repositories → services → permissions/
audit actions → validation schemas → UI → unit + integration +
Playwright tests → docs + ADR (if a real decision was made) → `npx tsc
--noEmit` / `npx eslint .` / `npx vitest run` / `npm run build` /
`npx prisma migrate status` all clean → commit → push. Don't start the
next module with the previous one's verification suite red or
uncommitted — that discipline held for every module built so far and
should keep holding.

## Addendum Module 2 — Interview Scoring revision (task #93) — DONE

See `docs/INTERVIEW_SCORING_REVISION.md` and
[ADR-0018](../docs/adr/ADR-0018-interview-scoring-revision.md) for what
was actually built and the resolution of each item below.

The Interview Workspace already shipped (`c84f87c`,
`docs/INTERVIEW_WORKSPACE.md`, ADR-0016) against the *old* brief's
looser rules. The Addendum (§2) is far more specific and **conflicts**
with three things already built — this is revision work, not greenfield:

1. **Structured comments.** §2.3 wants four distinct fields (Overall
   assessment / Strengths / Concerns / Recommendation), not the single
   freeform `InterviewScore.comments` field currently used. This is a
   schema change — either four new columns on `InterviewScore`, or a
   small structured-JSON field, or a side table. Decide and write an ADR
   (ADR-0016 explicitly deferred "per-criterion comment" to a later
   module — this is that module, though note §2.3's four fields are
   *per-submission*, not *per-question*, so it's not quite the same
   shape ADR-0016 was declining).
2. **3-of-4 minimum submission threshold + Secretariat override (§2.5–2.6).**
   Nothing like "Close Interview with Three Valid Scores" exists yet.
   Needs: a way to detect "3 or 4 of the assigned panel have submitted,
   proceed" vs "fewer than 3, incomplete"; a Secretariat action requiring
   a mandatory reason, auditing which panellist is missing; and the
   average calculation (§2.7) using only valid submissions, never fewer
   than three. `InterviewScore.status` (`DRAFT`/`SUBMITTED`/`RECUSED`)
   may need a new value or the missing-panellist case may map to
   `RECUSED` — check whether that's semantically right before reusing it,
   or whether a new status/flag is cleaner.
3. **Post-submission visibility of the final average (§2.4).** Right now
   a panellist only ever sees their own score (deliberately, per
   ADR-0016's "no cross-panellist screen this module" boundary). The
   Addendum explicitly wants panellists to additionally see *the final
   averaged score only* (never other panellists' individual scores/
   comments) once the threshold is met. This is new: compute the average
   (§2.7) and expose it — but only the number, structurally enforced the
   same way the rest of this module enforces "own data only."
   Programme Secretariat / Selection Committee / Executive Approval Panel
   get full visibility (all scores + all comments + average) — Committee
   and Executive Approval don't exist as modules yet (they're #97 and
   implicitly folded into Committee below), so their read access can be
   permission-gated now and consumed once those UIs exist.

Also worth checking: does "Average Interview Score" (§2.7) get written
to `ApplicationScore.interviewAverage`/`interviewScoreCount`? Those
fields exist on `ApplicationScore` (Phase 3B-era schema) and are still
unused — this is almost certainly where this module's calculated average
belongs, feeding Final Ranking (Module 4, task #95) the same way
`modules/scoring/services/scoreAggregationService.ts`'s
`recomputeReviewAverage` feeds the review-side half.

## Addendum Module 3 — Interview Questions (task #94) — DONE

See `docs/INTERVIEW_QUESTIONS.md` and
[ADR-0019](../docs/adr/ADR-0019-interview-questions.md) for what was
actually built and the resolution of each item below.

`InterviewQuestion` already exists in the schema (original Phase 1
migration, unused until now): `id, cohortId, text, order, isActive` —
flat, no mandatory/pathway/bank distinction. Needs extending (or a
sibling model) for:

- **Mandatory** flag (every applicant answers, can't skip).
- **Pathway-specific**, auto-displayed by the applicant's leadership
  pathway. `Application.pathway: String?` already exists (line ~420 in
  `prisma/schema.prisma`) — check what values are actually stored there
  today (the three pathways are named in the spec verbatim:
  "Entrepreneurship & Enterprise," "Public & Private Sector Leadership,"
  "Academia & Advanced Studies") before assuming free text vs an enum.
- **Approved question bank** for "additional" questions — panellists
  pick from the bank, never type an ad hoc question. This might just be
  `InterviewQuestion` rows tagged `category: MANDATORY | PATHWAY |
  ADDITIONAL_BANK` rather than a separate table.
- **Provenance tracking**: which question was actually asked in a given
  interview, which panellist chose an additional one, interview start/
  end time. None of this exists — needs a new join/log table (e.g.
  `InterviewQuestionAsked`) plus two new timestamp fields on `Interview`
  (or reuse existing ones if any fit).

This module changes what the Interview Workspace scoring form displays
(the question framework panellists see while scoring) — expect to touch
`app/(dashboard)/interviews/[interviewId]/scoring-form.tsx` again.

## Addendum Module 4 — Final Ranking (task #95)

`Application Review (/60) + Interview (/40) = Final Score (/100)`,
automatic only, ranked, every recalculation audited.

- `ApplicationScore.compositeScore`/`rank`/`rankingTier` exist and are
  still unwritten (Release 1 Module 1 deliberately stopped at
  `reviewAverage` only — see `docs/INTERVIEW_ASSIGNMENT_ENGINE.md`'s "Not
  built this module" section). This is that deferred work.
- `interview.weighting_percent` (Configuration Centre setting,
  `lib/settings/registry.ts`) currently defaults to **30**, but the
  Addendum's exact numbers are Interview 40% / Review 60%. Update the
  default to 40 and its description (it currently says "the Interview
  Engine is not built this phase" — no longer true once this module
  lands). Don't just hardcode 40 — the setting is meant to be the real,
  consumed value now, per "Weighting from Configuration Centre" (Module 4)
  and "Consume Configuration Centre values" (Module 3's own instruction,
  which applies in spirit here too).
- Reuse `modules/reviews/domain/scoring.ts`'s pattern (pure calculation
  functions, rounded once) rather than inventing new math — this module
  is a straightforward weighted combination of two already-computed
  numbers (`reviewAverage`, whatever Module 2's `interviewAverage` ends
  up being called), not a new scoring algorithm.
- `RankingSnapshot`/`RankingSnapshotEntry` (used for the "Interview
  Shortlist" in Module 1) is the same generalized mechanism this module
  should produce its own snapshot into — a differently-named,
  differently-sized one ("Final Ranking" or similar, size 30 via
  whatever setting Module 6 ends up using for "Top 30").

## Addendum Module 5 — Tie-Breaking (task #96)

Deterministic three-level cascade (interview score → review score →
committee justification), not a configurable single "rule." The existing
`interview.tie_break_rule` setting (`CHAIR_DECIDES` / `RE_VOTE` options)
**does not match this spec at all** — it predates the Addendum and was
never wired to anything ("Configuration only" in its description).
Decide whether to repurpose/replace it or leave it vestigial and build
the cascade as its own, separate, hardcoded-per-spec logic (the Addendum
says these three levels exactly, in this exact order — there's no
"configurable tie-break strategy" language here the way Module 4 has for
weighting). Level 3's committee justification needs Module 6 (Committee)
to exist first for the actual recording UI, so this module's Level-3
piece may need to land as a shared service function Module 6 calls into,
built together with or just after Module 6.

## Addendum Module 6 — Final Selection Committee (task #97)

`CommitteeVote`/`CommitteeDecision` already exist in the schema
(original Phase 1 migration, unused until now) — check their exact shape
before designing new tables; they may already fit "confirm Top 30,"
"confirm reserve list," "resolve ties," "record cohort-balancing
reasons" with light extension rather than new models. Named committee
members from the original overnight brief (Dr Izuchukwu Anyanwu, Dr
Danjuma, Prof Temitayo) — these are real people to provision as
`SELECTION_COMMITTEE_MEMBER` role accounts, not placeholder data.

Hard constraint to enforce at the service layer (not just UI hiding):
Committee **cannot** modify review or interview scores, or recalculate —
every mutating function in this module should read scores, never write
them. "Platform preserves: Original System Ranking, Final Approved
Cohort" as two distinct, both-immutable records — likely two
`RankingSnapshot` rows (one locked at generation, one locked at
committee approval), reusing the existing `RankingSnapshot.isLocked`
field.

## Addendum Module 7 — Reserve List (task #98)

`interview.reserve_list_size` setting already exists (default 10,
"Configuration only" — same wire-up pattern as `interview.duration_minutes`
before Module 1 consumed it). Promotion-on-decline logic
("recommends the next highest-ranked reserve... prevents reserves from
being skipped without recorded justification") needs its own audited
action — check `AdmissionOffer`'s existing status enum before assuming
what "declines/withdraws/fails to accept/becomes ineligible" map to.

## Addendum Module 8 — Offer Management (task #99)

`AdmissionOffer` already exists (original Phase 1 migration, unused
until now) — extend rather than replace. 7-day validity, day 3/6/7(expiry)
reminders — same "record and audit, never actually dispatch" boundary as
Interview Scheduling's reminders (see `handoff/DECISIONS_LOG.md` §4).
Auto-expiry-on-no-response needs the same "nothing calls this on a
timer" honesty `schedulingService.sendDueReminders` already documents —
don't invent a cron integration that isn't specified anywhere.

## Addendum Module 9 — Audit sweep (task #100)

Not new functionality — a verification pass once Modules 2–8 above are
built, confirming every event Addendum §9 lists is actually
audited. Scheduling's list (§9, "Scheduling") is already fully covered
by Module 1 (`INTERVIEW_AVAILABILITY_SUBMITTED/_UPDATED`,
`INTERVIEW_SLOTS_GENERATED/_PUBLISHED`, `INTERVIEW_SLOT_BOOKED`,
`INTERVIEW_BOOKING_CONFIRMED/_DECLINED`, `INTERVIEW_RESELECTION_REQUESTED`,
`INTERVIEW_TEAMS_LINK_ADDED`, `INTERVIEW_INVITATIONS_SENT`,
`INTERVIEW_REMINDER_SENT` — see `lib/audit/actions.ts`). Interview/
Ranking/Admissions lists still need their audit actions added as each
module above is built, then this task closes the loop by grep-checking
`lib/audit/actions.ts` and each service file against the full §9 list.

## Known pre-existing issue (not this session's to fix unless asked)

`tests/integration/reviewOperations.test.ts`'s "data minimization" test
occasionally fails: it asserts an exported CSV doesn't contain the
substring `"77"`, but Prisma's `cuid()` IDs are random and can
coincidentally contain `"77"` as a substring, causing a false failure
maybe 1 run in 10–15. Pre-existing, unrelated to any Addendum work,
confirmed by re-running in isolation (passes on a fresh random ID). If
it fires during a `npx vitest run`, re-run just that file before
concluding something broke.
