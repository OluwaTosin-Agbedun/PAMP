# ADR-0008: Percentage-Point Divergence Threshold and Reassignment History via Partial Unique Index

**Status**: Accepted (Phase 3B)

## Context

Two independent design questions came up while building the third-review
escalation engine and the reassignment flow, both involving a choice
between "the obvious literal reading of the brief" and a more robust
alternative.

## Decision 1: divergence threshold is a percentage of framework max, not a raw score gap

§2 states the threshold as "13 percentage points." Read literally against
a single framework, "13 points" and "13 percentage points" are
interchangeable. They stop being interchangeable the moment a second
framework with a different max possible score exists — a 13-point gap
means something very different on a 15-point framework versus a
200-point one.

**Decision**: divergence is computed as
`|score1/max × 100 − score2/max × 100|` —
`modules/reviews/domain/thirdReviewEngine.ts`'s `calculateDivergencePercent`
— so "13" is a percentage-of-max figure, comparable across every
framework regardless of its configured maximum.

### Alternatives considered

**Raw point difference, hardcoded against the one framework that exists
today (60 points).** Simpler, and arguably a defensible literal reading
of "the threshold is currently 13." Rejected because the brief's own §1
requires the engine be "reusable for future programmes and review
stages," and Phase 3A already established the precedent of never
hardcoding a framework's total against the codebase (see
`docs/SCORING_ENGINE.md` on why `totalConfiguredScore` is computed, not
assumed) — a raw-point threshold would silently reintroduce exactly the
kind of hardcoding that precedent exists to avoid the moment a second
framework with a different max is published.

**A configurable threshold *per framework*, rather than one global
setting.** Rejected as unnecessary complexity for V1.0, which has one
active framework; the percentage normalization already solves the
"different framework sizes" problem without needing a second axis of
configuration. Revisit if a future programme genuinely wants a stricter
or looser divergence tolerance for a specific stage.

## Decision 2: reassignment history via a partial unique index, not row mutation

§10 requires reassignment to "preserve history" — the original reviewer,
the original timestamps, and never a silent overwrite. The pre-existing
`ReviewAssignment` schema had `@@unique([applicationId, slot])`, which
makes it impossible to have two rows for the same application/slot pair
— exactly what preserving history requires (the old row plus a new one).

**Decision**: drop the unconditional unique constraint. Add a
self-referencing `reassignedFromId` (nullable, `@unique`) so a new row
can point back at the row it replaces, and add a **partial unique
index** in the migration's raw SQL —
`CREATE UNIQUE INDEX ... ON review_assignments(applicationId, slot)
WHERE status NOT IN ('REASSIGNED', 'CANCELLED')` — so at most one *active*
row exists per slot, while any number of historical (reassigned-away or
cancelled) rows can coexist with it. Prisma's declarative schema can't
express a `WHERE`-qualified unique index, so this follows the same
hand-written-migration-SQL pattern already established for the `pg_trgm`
indexes in earlier phases (`docs/database.md`'s indexing strategy
section).

### Alternatives considered

**Mutate the existing row's `reviewerId` in place, log the change in the
audit trail.** This is what a naive "reassign = change who's assigned"
implementation would do, and it directly violates "preserve original
reviewer, timestamps... no silent overwrite" — the row itself would no
longer show who was originally assigned or when, only the audit log
would, and only if nobody ever queries the `ReviewAssignment` table
directly. Rejected: the brief is explicit that the *record itself* must
preserve history, not just the audit trail.

**A separate `ReviewAssignmentHistory` table, `ReviewAssignment` staying
uniquely constrained.** Considered, and closer to how Phase 3A handled
"reconstruct the prior submitted state" for a reopened review — but that
precedent explicitly chose the audit trail over a second table *because*
Phase 3A's history need was narrow (one snapshot, at one point:
submission). Reassignment history is different: an old, reassigned-away
`ReviewAssignment` row needs to keep behaving like a normal
`ReviewAssignment` (queryable with the same shape, joinable the same way,
visible in the same repository functions) for as long as it exists —
duplicating that shape into a second table would be exactly the kind of
parallel-schema-surface-to-keep-in-sync Phase 3A's doc comment on
`REVIEW_REOPENED` metadata warns against. Rejected in favor of keeping
one table, one shape, with a partial index as the enforcement mechanism.

## Consequences

- `ReviewAssignment.reassignedFromId` forms a chain, not a tree: an
  assignment reassigned twice produces three rows,
  `A ← B ← C`(where `C` is active), each retrievable and each still
  individually queryable with the same repository functions as any other
  `ReviewAssignment` row.
- `assignmentRepository.ts`'s "active" queries all filter on
  `status NOT IN ('REASSIGNED', 'CANCELLED')` explicitly in application
  code — the partial index enforces the *uniqueness* invariant at the
  database layer, but every read path still needs its own active-status
  filter to get the right *rows* (the index doesn't automatically scope
  `SELECT`s, only `INSERT`/`UPDATE` uniqueness checks).
- Any future schema tooling that inspects `@@unique` declarations
  directly (rather than reading migration SQL) will not see this
  constraint — it's documented in `schema.prisma`'s model comment and
  here specifically so it isn't rediscovered by surprise.

## Future implications

If a future phase needs "how many times has this slot been reassigned,"
that's a `COUNT` over the `reassignedFromId` chain, not a schema change.
If historical assignment rows ever need to be purged for storage
reasons, they can be deleted independently of the active row — nothing
about the partial index requires keeping them forever, only that at most
one *active* row exists at any time.

## Addendum: threshold default revised from 13 to 20 (PAM-P 2026 source correlation)

The percentage-of-max mechanism in Decision 1 is unchanged. Only the
*default value* of `review.third_review_divergence_threshold_percent`
moved, from 13 to 20, to match the "PAM-P 2026 Application Review
Guidelines and Scoring" document, which frames the escalation trigger as
a 12–15 mark gap out of 60 (20–25%) rather than a flat 13-point gap. 20
was chosen as the midpoint of that range. This is a setting change
(`lib/settings/registry.ts`), not a mechanism change — existing
deployments that have already overridden this setting are unaffected.
