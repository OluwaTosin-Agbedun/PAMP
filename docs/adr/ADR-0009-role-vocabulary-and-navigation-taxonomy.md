# ADR-0009: Role Vocabulary and Navigation Taxonomy Reconciliation

**Status**: Accepted (Phase 3B.1) — one item left open, see "Open question" below.

## Context

Two open items had been carried in `docs/architecture.md` since Phase 0:
the codebase's role vocabulary and navigation taxonomy both differed
from the frozen EFMS prototype. Phase 0 resolved this *by omission* at
the time — one `REVIEWER` role, no `Observer`, module-per-route
navigation — documented in `docs/RBAC.md`'s "why one REVIEWER role"
section with real, reasoned justification (eligibility screening is
fully automatic; there was no human review action to gate with a
separate role).

Phase 3B.1's brief formally names nine approved PAM-P operational roles
— including `Eligibility Reviewer` and `Application Reviewer` as
distinct roles — and a 12-item navigation taxonomy, superseding that
Phase 0 resolution. This ADR records the decisions made to reconcile the
codebase against it.

No prototype artifact (`design_handoff_pamp_efms/`, `EFMS.dc.html`, or
anything matching `*efms*`/`*prototype*`/`*handoff*`) exists anywhere in
this repository or environment — confirmed by search before writing any
code, not assumed. Everything reconciled here is against this phase's
brief (the current authoritative statement of the approved roles and
taxonomy), not a re-derivation from an uninspectable prototype.

## Decision 1: split REVIEWER into ELIGIBILITY_REVIEWER and APPLICATION_REVIEWER

`Role.REVIEWER` is replaced by `Role.ELIGIBILITY_REVIEWER` and
`Role.APPLICATION_REVIEWER`. `APPLICATION_REVIEWER` gets the former
`REVIEWER` role's exact capability set (a rename, not a capability
change): `applications.view`, `reviews.perform`, `reviews.view`,
`review_frameworks.view`, `review_scores.submit`, `conflicts.declare`.
`ELIGIBILITY_REVIEWER` gets `applications.view` and the pre-existing,
already-read-only-by-design `eligibility.review` permission — no scoring
capability, because eligibility screening is still fully automatic and
there is still no human eligibility-decision action for the role to
perform beyond viewing.

### Existing user migration

Postgres enums have no `ALTER TYPE ... DROP VALUE` — removing a value
requires creating a replacement type with the correct value set,
migrating every column that uses it, dropping the old type, and renaming
the new one into place. `Role` is used by exactly one column
(`users.role`), so the migration is a single `ALTER COLUMN ... TYPE ...
USING`, with a `CASE` expression backfilling every existing `'REVIEWER'`
row to `'APPLICATION_REVIEWER'` in the same statement (see
`prisma/migrations/20260719160000_phase3b1_role_split/migration.sql`).

Three real `REVIEWER` accounts existed
(`reviewer.one@pam-p.org`, `reviewer.two@pam-p.org`,
`chinaza.igwe@pam-p.org`), all created manually during Sequence 1's
verification walkthrough, all with `ReviewAssignment`/`Review` history
tied exclusively to automatic application-review assignment — none has
any eligibility-review history, because there has never been an
eligibility-review action to perform. The evidence affirmatively
establishes `APPLICATION_REVIEWER` as correct for all three; this is not
a "no evidence, default to least privilege" case, though the outcome
happens to coincide with what least-privilege reasoning would also
produce (an account with a real work history is mapped to the role that
history actually reflects, not defaulted into a broader or narrower
role by assumption). No account was deleted; no field besides `role`
changed; every account's `id`, `createdAt`, audit history, and prior
`ReviewAssignment`/`Review` rows are untouched.

### Alternatives considered

**Grant `ELIGIBILITY_REVIEWER` nothing beyond what already existed
(don't create the role at all, keep `REVIEWER` as `APPLICATION_REVIEWER`
under a new name only).** Rejected — the brief names `Eligibility
Reviewer` as one of nine approved operational roles explicitly; not
creating it would leave the role vocabulary still non-compliant with the
approved list, the exact thing this phase exists to fix.

**Invent a new eligibility-override/manual-review action so
`ELIGIBILITY_REVIEWER` has something more substantial to do.** Rejected
— this would be new eligibility-engine feature scope, not a role/
permission/navigation reconciliation, and nothing in this phase's brief
specifies what such an override action should look like (who can
initiate it, what happens to the automatic decision, whether it needs its
own audit trail and reason field, whether it affects
`Application.eligibilityStatus` directly). Inventing it without that
specification would be building a guessed feature, not reconciling an
existing one — directly against this session's standing "stop, don't
invent" discipline, applied consistently since Phase 3A's missing
criteria and Phase 3B's assignment-engine gaps.

### Open question

**Does the approved PAM-P workflow intend `Eligibility Reviewer` to
eventually perform a human review/override action on automatic
eligibility decisions, or is it permanently a read-only oversight role?**
This phase implements the latter — the minimal, evidence-supported
interpretation, and the one that changes nothing about the existing,
deliberately-automatic eligibility engine. If the former is intended,
that's new scope for a future phase (extending
`modules/eligibility/service.ts` with a manual-override path, a new
permission for exercising it, and a UI for it), not something this
reconciliation should have guessed at and built partially. Flagged per
this phase's own "stop if any unresolved role mapping requires
programme-owner confirmation" instruction.

## Decision 2: one navigation group per approved taxonomy item, no deeper nesting

`lib/navigation.ts`'s `NAV_GROUPS` was restructured from 6 groups (some
combining unrelated pipeline stages, e.g. Selection Committee + Executive
Approval under one "Selection" group) into 11 groups — one per approved
taxonomy item 2–12 (Dashboard, item 1, stays the separate pinned item it
already was). Three items that had no nav entry at all before
(Applicant Import, Notifications) or were nested inside a different
group (Eligibility Screening, Audit Trail, both previously under
"Administration") now have their own top-level slot.

### Alternatives considered

**Keep the existing 6-group structure, just rename labels to match.**
Rejected — the approved taxonomy is a flat, ordered 12-item list;
leaving Selection Committee and Executive Approval sharing one group
(or Audit Trail nested under Administration) would still visually and
structurally conflict with that list, not just cosmetically differ from
it.

**Restructure `components/layout/{sidebar-nav,mobile-nav}.tsx` to
support a different rendering model (e.g., flat links instead of
collapsible groups) for the now-mostly-single-item groups.** Rejected as
unnecessary — both components already render whatever `NAV_GROUPS`
returns generically, and a single-item group already renders correctly
under the existing `NavGroupSection` component (defaults to expanded
when it has ≤1 items). Reshaping the *data* in `lib/navigation.ts`
satisfies the approved taxonomy with zero component changes — the
smaller, safer edit.

**Add a `notifications.view` permission and a placeholder nav
entry for a module that doesn't exist yet.** Accepted, not rejected —
included here because it's the one addition beyond pure reconciliation
of existing items. Justified because the approved taxonomy explicitly
lists Notifications as item 10 and explicitly permits "future modules
[to] remain hidden or marked as unavailable, but the taxonomy must not
conflict with the approved workflow" — a taxonomy slot that doesn't
exist yet *would* conflict (there'd be nowhere for it to go without a
later restructure). Adding the slot now, `implemented: false`, costs one
permission identifier and one nav entry; shipping the module later is a
one-line flip, not a navigation change.

## Consequences

- Every one of this phase's role/permission/navigation changes is
  additive-or-renaming at the code level — no existing permission
  identifier was removed, no existing route's guard weakened, no
  existing capability taken away from any account. The only *removed*
  surface is the `REVIEWER` enum value itself, replaced 1:1 by data-
  supported migration.
- `docs/RBAC.md`'s "why one REVIEWER role" section is kept, not deleted
  — marked superseded, with its original reasoning preserved as the
  basis for why `ELIGIBILITY_REVIEWER` is scoped read-only rather than
  invented with broader capability.
- The "Eligibility Screening" nav group currently has exactly one item
  (the criteria-configuration screen, not accessible to
  `ELIGIBILITY_REVIEWER`, who lacks `eligibility.manage_criteria`) — an
  `ELIGIBILITY_REVIEWER` account sees no item in that group today. This
  is an honest reflection of what the system can currently show that
  role, not a bug; see
  `docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`'s "known gap" section.

## Future implications

The open question above is the natural trigger for a future phase's
scope: if eligibility screening ever needs a human review/override step,
that phase adds the actual capability (service logic, permission,
audit, UI) — `ELIGIBILITY_REVIEWER` as a role is already in place and
would just gain the new grant, no further role-vocabulary work needed.
The Notifications taxonomy slot is similarly ready for whichever future
phase builds delivery — flip `implemented: true` on its one nav entry,
build the route behind the already-existing `notifications.view`
permission.
