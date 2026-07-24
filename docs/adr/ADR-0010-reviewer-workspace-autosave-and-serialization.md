# ADR-0010: Reviewer Workspace Autosave and Server/Client Serialization

**Status**: Accepted (Phase 3C)

## Context

Phase 3C built the first real UI against Phase 3A's review-scoring
service layer. Two implementation questions came up that didn't have an
established precedent elsewhere in this codebase: how to autosave a
form with debounced Server Action calls (no prior form in this app
autosaves — every existing form is a single explicit submit), and how to
get `Prisma.Decimal`-typed scoring data from a Server Component into a
Client Component (no prior page passed Decimal-bearing data across that
boundary — the existing pages either don't touch scores at all, or
render Decimal values directly as text in a Server Component without
ever needing to hand them to client-side state).

## Decision 1: resend the full current draft on every autosave tick, not a diff

`saveDraftScores` already treats its `scores` array as "exactly the
criteria included in this call, upserted" — a partial call only touches
what's sent. The autosave debounce (1.2s after the last keystroke)
sends every currently-filled-in criterion's score and comment on each
tick, not just the field that changed.

### Alternatives considered

**Track and send only the single changed field.** Would save marginal
request payload size (a handful of extra small fields per autosave
call, on a form with at most a few dozen criteria) at the cost of
needing per-field dirty-tracking state and a merge strategy for two
fields changing within the same debounce window (e.g., typing in a
score then immediately tabbing to its comment). Rejected — the "send
everything currently filled in" approach is simpler, cannot desync from
what's actually in the form, and the request size difference is
negligible at this scale.

**A version/timestamp check to detect and reject a stale autosave
(optimistic concurrency).** Rejected for the same reason Phase 3A
rejected it for draft saves generally (`docs/REVIEW_LIFECYCLE.md`'s
concurrency table): a *draft* isn't the case that needs this protection
— last-write-wins matches ordinary autosave semantics, and the
review-owns-the-review invariant (only the assigned reviewer can ever
write to their own review) means there's no multi-writer race to guard
against the way `submitReview`'s status-conditioned update guards
against a genuine double-submission.

## Decision 2: convert every Decimal to a string in the Server Component, not the Client Component

`app/(dashboard)/reviews/[assignmentId]/page.tsx` maps
`ReviewCriterion`/`RatingScaleBand`/`ReviewScore` rows (all carrying
`Prisma.Decimal` fields) into plain-string view models
(`CriterionViewModel`, `ScoreViewModel` in
`app/(dashboard)/reviews/[assignmentId]/types.ts`) before rendering
`ScoringForm`/`ReviewSummary`. `Prisma.Decimal` is a `decimal.js` class
instance — Next's Server → Client Component boundary only accepts plain,
JSON-serializable values, and passing a class instance as a prop throws
at render time.

### Alternatives considered

**Convert inside the Client Component, on first render.** Would require
passing the raw Prisma rows as props in the first place — which is
exactly what throws. Not viable without first solving the same
conversion problem one level later, for no benefit.

**Use plain `number` instead of `string` for the converted values.**
Rejected — money/score-adjacent decimal values lose precision through a
float round-trip (the same reasoning `docs/SCORE_CALCULATION_RULES.md`
gives for using `Prisma.Decimal` server-side at all); a string
round-trips exactly and is what every `<input type="number">` value
already is in the DOM regardless.

**A generic `serializeDecimals(obj)` deep-walker utility, used
everywhere a Decimal might appear.** Considered, and rejected as
premature for a single call site — Phase 3C has exactly one page that
needs this conversion, with a shape specific enough (nested criteria,
nested rating scale bands, a scores array) that a generic deep-walker
wouldn't meaningfully simplify the explicit `toCriterionViewModel`
mapping function already written. Revisit if a second, differently-shaped
page needs the same conversion — Interview scoring (Phase 4A) is the
most likely candidate, since it has its own Decimal-bearing criteria.

## Consequences

- The view-model types in `types.ts` are the one place that documents
  exactly what data crosses the Server → Client boundary for this
  feature — useful as a reference for Phase 4A's Interview scoring UI,
  which will face an identical Decimal-serialization requirement.
- Autosave failures are visible (an inline `aria-live` status region)
  but not retried automatically — a failed autosave tick doesn't queue a
  retry; the *next* field edit schedules a fresh autosave attempt,
  which will resend the still-unsaved data along with anything new.
  There is no scenario where a failed autosave silently drops data the
  reviewer typed, because the failed data is still sitting in component
  state and gets included in every subsequent attempt (including the
  final submit).

## Future implications

If Interview scoring (Phase 4A) or Committee scoring reuses this
autosave pattern, the "resend everything currently filled in, no dirty
tracking" approach should be re-examined for those pages' criteria
counts before assuming it scales identically — this ADR's reasoning is
scale-dependent (based on "a handful of criteria," matching
`docs/database.md`'s documented Application Review max of 60), not a
universal claim that diffing never matters.
