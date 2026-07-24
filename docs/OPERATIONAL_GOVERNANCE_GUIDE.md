# Operational Governance Guide

Release 1.5's governance additions, as a set of principles rather than a
feature list — how this codebase now enforces "who decides what," "who
executes what," and "what gets recorded," across the Configuration
Centre, Eligibility QA, and every existing workflow.

## Principle 1: Recommending is never executing

Every governance decision Release 1.5 added splits "propose a change"
from "make the change" into two different permissions, held by two
different roles:

- Eligibility QA: `eligibility_recommendations.create`
  (`ELIGIBILITY_REVIEWER`) vs. `eligibility_override.execute`
  (`PROGRAMME_SECRETARY`). See `docs/ELIGIBILITY_QA_GOVERNANCE.md`.

This mirrors a pattern already established in Phase 3B's reassignment
engine (a reviewer declares their own conflict; only an administrator
records one on another reviewer's behalf) and Phase 3D's Secretariat
Workspace (the Secretariat can *initiate* a reassignment but a separate,
already-tested engine independently re-verifies eligibility before it
happens). Release 1.5 continues the same discipline rather than
inventing a new one: no role can both flag and resolve its own flag.

## Principle 2: View and manage are separate permissions, even when co-granted

`configuration.view`/`configuration.manage`, and — inherited from Phase
3D — `review_operations.view`/`review_operations.export`, are distinct
permissions even when every role that has one currently has the other.
This is deliberate future-proofing: a narrower role (a read-only
configuration auditor, an export-only reporting account) is a one-line
permission grant, never a code change, because the distinction already
exists in the permission catalogue.

## Principle 3: A structural guarantee is documented, not silently
## presented as configurable

Some things this codebase does are not policy choices — they're
architectural guarantees. Blind review (Reviewer 1 and Reviewer 2 never
see each other's work) is enforced by query scoping throughout
`modules/reviews/`, not a boolean anywhere. The Configuration Centre
shows `review.blind_review_enabled` as a read-only, always-true setting
rather than either omitting it (leaving an administrator unable to
confirm the guarantee exists) or presenting it as a real toggle
(implying it could be turned off, which would require restructuring
security-relevant query logic this release deliberately does not touch).
The same treatment applies to the ranking method and third-review
calculation strategy — each has exactly one implemented approach; the
Configuration Centre says so honestly rather than implying a
pluggability the codebase doesn't have.

## Principle 4: Every governance action is audited, with enough context
## to reconstruct what happened

Release 1.5's audit enhancement ([ADR-0014](adr/ADR-0014-audit-context-async-local-storage.md))
means every audit row — not just the new governance ones — now carries
a Correlation ID (ties multi-step actions together), a Request ID, a
Session ID, an IP Address, and a User Agent, in addition to the actor
and timestamp already recorded. A reassignment, an eligibility override,
a configuration change, and a feature-flag flip are all reconstructible
after the fact: who, from where, in what session, as part of what
broader action.

## Principle 5: Don't invent enforcement the brief didn't ask for

Several Security Configuration settings (failed-login threshold, account
lock duration, session timeout) are stored, validated, and shown in the
Configuration Centre, but are **not** automatically enforced yet — this
is stated plainly in `docs/CONFIGURATION_REFERENCE.md`, not hidden. This
codebase has never had an automated lockout policy
(`docs/AUTHENTICATION.md` has documented this as "reserved for future"
since Phase 2); wiring a live failed-attempt counter and auto-lock
mechanism this late in a large release, under time pressure, would be
exactly the kind of shortcut this project's standing discipline warns
against. Storing the configuration now — with the limitation stated,
not implied — means the enforcement mechanism is a bounded follow-up,
not a rushed, under-tested addition to the authentication path.

## Where this is enforced in code

- Permission checks: `lib/permissions/catalog.ts`,
  `lib/permissions/rolePermissions.ts`.
- Recommend/execute split: `modules/eligibilityQa/services/
  recommendationService.ts`.
- View/manage split: every `requirePermission(actorId, PERMISSIONS
  .X_VIEW)` vs. `PERMISSIONS.X_MANAGE` call in `modules/configuration/`
  and `lib/featureFlags/service.ts`.
- Read-only settings: `readOnly: true` entries in `lib/settings/
  registry.ts`, enforced in `lib/settings/service.ts`'s
  `validateValue`.
- Audit context: `lib/audit/context.ts`, `lib/audit/log.ts`.
