# ADR-0020: Final Ranking Doesn't Write `ApplicationScore.rankingTier`

**Status**: Accepted (Addendum Modules 4-5)

## Context

`ApplicationScore.rankingTier` (`RankingTier` enum: `TOP_70 | TOP_60 | RESERVE |
NOT_RANKED`) has existed since the very first schema migration, alongside `rank` and
`compositeScore` — all three read, on their face, like fields the Final Ranking Engine
should populate. `docs/database.md` itself flagged this as an open question before any
of Modules 1-5 were built: "if the target sizes ever change (e.g. Top 80), this enum
needs a migration... keep as-is or generalize further (e.g. `RankingTier` becomes a
free-text/foreign-key reference to whichever `RankingSnapshot` an application belongs
to, dropping the enum entirely)?"

The target size did change. `docs/architecture.md` documents the resolution history:
"Top 70" was always the *interview-shortlist* size (Release 1 Module 1, a different,
still-current concept, unaffected), while the final *cohort* size was later confirmed by
the Enterprise Functional Specification Addendum as **Top 30** — a number `RankingTier`'s
`TOP_70`/`TOP_60` values don't represent at all.

Separately, `SelectionOutcome` (`SELECTED | RESERVE | REJECTED`) already exists on
`CommitteeVote`/`CommitteeDecision` — schema-only since the original pre-addendum brief,
never referenced by any application code. Addendum Module 6 ("Final Selection
Committee") is explicit that this role, not the ranking engine, makes the actual
selected/reserve/rejected call: "Committee SHALL: Confirm Top 30 Fellows, Confirm
Reserve List... Where Committee departs from the strict ranking: System requires
mandatory justification."

## Decision

Final Ranking (this module) never writes `ApplicationScore.rankingTier`. It stays at its
schema default (`NOT_RANKED`) for every row, untouched — reserved, unused, exactly as it
was before this module. `ApplicationScore.rank` and `.compositeScore` are the two fields
this module actually owns and writes.

"Is this candidate provisionally within the confirmed final cohort size" is answered at
read time instead — comparing `RankingSnapshotEntry.rank` against the snapshot's own
`targetSize` (the `ranking.finalCohortSize` Configuration Centre setting, mirroring
`ranking.top70Size`'s existing pattern) — never persisted as a stored tier value. This is
exactly the `docs/database.md` open question's own suggested alternative, now acted on:
the generalized `RankingSnapshot` mechanism answers "which tier" without needing a
column that would otherwise need re-migrating every time the confirmed cohort size
changes again.

`SelectionOutcome`/`CommitteeDecision` remain reserved, exactly as-is, for Module 6 to
actually own the authoritative selected/reserve/rejected decision when it's built.

## Alternatives considered

**Repurpose `RankingTier`'s values to match Top 30 (e.g. rename `TOP_70`/`TOP_60` to
something Top-30-shaped) and write it from `generateFinalRanking`.** Rejected on two
grounds: first, it doesn't resolve `docs/database.md`'s own flagged risk — the next
confirmed-cohort-size change would need another migration, the exact problem the open
question anticipated. Second, and more importantly, it risks exactly the field-authority
confusion this ADR is written to avoid: a value this module writes automatically
(`rankingTier`) sitting one column away from a value Module 6's committee writes as an
authoritative, possibly-departs-from-ranking decision (`SelectionOutcome` via
`CommitteeDecision`), with near-identical semantics (`SELECTED`/`RESERVE` in both) and no
schema-level way to tell which one currently governs a given application.

**Leave the question for Module 6 and don't resolve it now.** Rejected — the
`docs/database.md` open question was never actually answered by any of the phases
between the original schema design and this module, and Final Ranking is exactly the
point where "does this field get written or not" becomes a real, unavoidable decision
(the workspace has to show *something* for "is this candidate within the cohort");
deferring again would just repeat the pattern that left the question open this long.

## Consequences

- `RankingTier`'s enum values (`TOP_70`/`TOP_60`/`RESERVE`/`NOT_RANKED`) remain in the
  schema, unused by any code, exactly as they were. A future cleanup migration could drop
  the column entirely if Module 6 confirms it will never need it — not done here, since
  removing schema this module doesn't own is out of scope and the column costs nothing
  sitting unused.
- Any future code that reads `ApplicationScore.rankingTier` expecting it to reflect the
  current ranking will find it permanently `NOT_RANKED` — this is intentional, not a bug;
  the current tier lives in the latest `RankingSnapshot`'s entries instead.
- When Module 6 is built, `CommitteeDecision.decision` (`SelectionOutcome`) becomes the
  one authoritative "is this candidate selected/reserve/rejected" answer, with
  `RankingSnapshotEntry.rank`/`.score` as the immutable "why" underneath it — no
  overlapping field to reconcile.
