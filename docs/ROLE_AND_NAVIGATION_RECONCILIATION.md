# Role and Navigation Reconciliation (Phase 3B.1)

Before the Reviewer Workspace (Phase 3C) is built against it, this
reconciles the role vocabulary and navigation taxonomy against the
approved PAM-P operational model. Two items were carried as open in
`docs/architecture.md` since Phase 0: the role vocabulary and the
navigation taxonomy both differed from the frozen EFMS prototype and
(per this phase's brief) the approved selection workflow.

## A note on what "the frozen EFMS prototype" actually is, in this repository

No prototype file exists anywhere in this repository or environment —
confirmed by search (`design_handoff_pamp_efms/`, `EFMS.dc.html`,
anything matching `*efms*`/`*prototype*`/`*handoff*`) before writing
this document, not assumed. Everything this codebase has ever known
about the prototype is the two paragraphs already in
`docs/architecture.md` (Phase 0): its design tokens (navy `#08438A`,
gold), and a prose description that its "README/app-shell code used a
different role vocabulary (`Eligibility Reviewer`/`Application
Reviewer` split, an `Observer` role, no `Programme Director`) and a
workflow-stage nav shell instead of separate module routes." Phase 0
deliberately resolved that difference *by omission* — collapsing to one
`REVIEWER` role and module-per-route navigation, "as given directly in
the working session" at the time. This document does not re-derive
anything from a prototype artifact that isn't inspectable; it reconciles
against this phase's brief, which is the current authoritative statement
of the approved PAM-P operational roles and workflow taxonomy.

## Role vocabulary discrepancy matrix

| Current (`Role` enum) | Approved equivalent | Required action | Migration / compatibility impact |
|---|---|---|---|
| `SYSTEM_ADMIN` | System Administrator | None — already matches. | None. |
| `PROGRAMME_DIRECTOR` | Programme Director | None — already matches. | None. |
| `PROGRAMME_SECRETARY` (label already `"Programme Secretary/Admin"`) | Programme Secretary/Admin | None — enum value and label already match. | None. |
| `REVIEWER` | **Split into** Eligibility Reviewer + Application Reviewer | Split the enum value into `ELIGIBILITY_REVIEWER` and `APPLICATION_REVIEWER`. See "The REVIEWER split" below for the reasoning and the one open governance question it raises. | Postgres enum type swap (see §Migration); all 3 existing `REVIEWER` accounts backfilled to `APPLICATION_REVIEWER` — data-supported, not a guess (see "Existing user migration" below). |
| `INTERVIEWER` | Interviewer | None — already matches. | None. |
| `SELECTION_COMMITTEE_MEMBER` | Selection Committee Member | None — already matches. | None. |
| `EXECUTIVE` | Executive | None — already matches. | None. |
| `FELLOW` | Fellow — future phase | None — already matches; already zero-permission and excluded from `ASSIGNABLE_ROLES`, exactly as "future phase" implies. | None. |
| *(no `OBSERVER` value exists)* | Observer must not remain unless approved | Already compliant — no action needed. `docs/RBAC.md` already documents this decision (the prototype's `Observer` role was resolved by giving read-only oversight via `*.view` permissions on approved roles instead, e.g. `PROGRAMME_SECRETARY`'s `executive.view`). | None. |

**8 of 9 approved roles already matched the codebase exactly, unchanged
since Phase 0.** The only substantive discrepancy is the `REVIEWER`
split.

### The REVIEWER split

`docs/RBAC.md` (Phase 2) carries a section titled *"Why one `REVIEWER`
role, not separate Eligibility/Application Reviewer roles"* — a
deliberate, reasoned decision that eligibility screening is **fully
automatic** in this codebase's approved design
(`modules/eligibility/service.ts`, criteria-driven, no human decision in
the loop), so there was no human "eligibility review" *action* left to
gate with a separate role. `ELIGIBILITY_REVIEW` was scoped as a
*read-only* permission for exactly this reason.

This phase's brief formally names `Eligibility Reviewer` and
`Application Reviewer` as two of the nine approved operational roles,
which supersedes that Phase 2 decision. The split is implemented as
follows, preserving the Phase 2 reasoning rather than contradicting it:

- **`APPLICATION_REVIEWER`** gets exactly the capability set the old
  `REVIEWER` role had for *scoring applications*: `applications.view`,
  `reviews.perform`, `reviews.view`, `review_frameworks.view`,
  `review_scores.submit`, `conflicts.declare`. Zero functional change
  for anyone doing application-review work — this is a rename, not a
  capability change.
- **`ELIGIBILITY_REVIEWER`** gets `applications.view` and
  `eligibility.review` (the pre-existing, already-read-only-by-design
  permission) — visibility into automatic eligibility decisions, no
  scoring capability. This is the *only* capability the current system
  has to offer an "eligibility reviewer": there is still no human
  eligibility-decision action to gate, because eligibility screening is
  still fully automatic. Splitting the role doesn't change that; it
  formalizes read-only eligibility oversight as its own role rather than
  bundling it into `REVIEWER` or leaving it implicit in
  `PROGRAMME_SECRETARY`'s broader view access.

**Open governance question, not resolved by this phase:** does the
approved PAM-P workflow intend for `Eligibility Reviewer` to eventually
*perform* a human review/override action on automatic eligibility
decisions (which would require new eligibility-engine capability, well
beyond a role/permission/navigation reconciliation), or is it a
permanently read-only oversight role, matching the fully-automatic
design as-is? This phase implements the latter (read-only) — the
minimal, evidence-supported interpretation of what "Eligibility
Reviewer" can mean in the system as it exists today, and the
interpretation that doesn't invent a feature nobody has specified. If
the intent is the former, that's new eligibility-engine scope for a
future phase, not a reconciliation. See
[`docs/adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md`](adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md)
for the full decision record. **Flagged per this phase's own "stop if
any unresolved role mapping requires programme-owner confirmation"
instruction — this is that unresolved item.**

### Existing user migration

Three real `REVIEWER` accounts exist in the database
(`reviewer.one@pam-p.org`, `reviewer.two@pam-p.org`,
`chinaza.igwe@pam-p.org` — the last `INACTIVE`). All three were created
manually during Sequence 1's verification walkthrough and have only ever
been used for automatic application-review assignment
(`ReviewAssignment`/`Review` rows tied to Application Review, via
`autoAssignReviewers`, which has only ever queried `Role.REVIEWER` for
that purpose). None has any eligibility-review history — there is none
to have, since eligibility has always been fully automatic. **The
existing data affirmatively establishes `APPLICATION_REVIEWER` as the
correct mapping for all three** — this is not a "no evidence, use
least-privilege" case; the evidence points one way. No user is assigned
`ELIGIBILITY_REVIEWER` during migration — it's a newly available role a
System Administrator can provision going forward, with no existing
account force-fit into it. No account is deleted, and every account's
`id`, audit history, and prior `ReviewAssignment`/`Review` rows are
untouched — only `User.role`'s value changes, exactly as this phase's
"preserve existing users safely" requirement asks.

## Navigation taxonomy discrepancy matrix

| # | Approved item | Current state | Required action |
|---|---|---|---|
| 1 | Dashboard | `PINNED_NAV_ITEM`, no permission, always visible to any active staff role. | None — already matches. |
| 2 | Applicant Import | `/applicants/import` route exists (`applications.import` permission, already implemented and gated), but had **no nav entry at all** — only reachable from a button on the Applicants list page, not the sidebar. Group was labeled "Applicant Management" containing only the Applicants list. | Add a nav item for `/applicants/import`; rename the group to "Applicant Import" to match the approved label. |
| 3 | Eligibility Screening | "Eligibility Criteria" (admin rule configuration) lived inside the "Administration" group — not its own taxonomy slot. | Give Eligibility Screening its own top-level nav group; move "Eligibility Criteria" into it. |
| 4 | Application Review | "Reviewer Workspace" (unimplemented), combined with Interview Workspace under one "Reviews & Interviews" group. | Split into its own top-level group, labeled "Application Review" to match. |
| 5 | Interview Management | "Interview Workspace" (unimplemented), combined with Reviewer Workspace. | Split into its own top-level group, labeled "Interview Management". |
| 6 | Selection Committee | Combined with Executive Approval under one "Selection" group. | Split into its own top-level group. |
| 7 | Executive Approval | Combined with Selection Committee. | Split into its own top-level group. |
| 8 | Admissions | Already its own group. | None — already matches. |
| 9 | Reports | Group labeled "Reports & Analytics". | Rename group label to "Reports" to match exactly. |
| 10 | Notifications | **No nav entry, no permission, no route exists.** `Notification` table exists (Phase 0) but nothing delivers to or reads from it yet. | Add a placeholder nav group (`implemented: false`) and a new `notifications.view` permission, so the taxonomy slot exists now and a future phase only has to flip `implemented: true` — not restructure navigation. |
| 11 | Audit Trail | Nested inside "Administration". | Promote to its own top-level group. |
| 12 | Administration | Contained Users, Eligibility Criteria, and Audit Trail. | Keep Users only — Eligibility Criteria and Audit Trail move to their own taxonomy slots (items 3 and 11). |

All 12 approved items now correspond to exactly one top-level nav group
(Dashboard pinned + 11 groups), in the approved order.
`components/layout/{sidebar-nav,mobile-nav}.tsx` needed **no changes** —
both already render whatever `lib/navigation.ts` returns generically; a
single-item group already renders correctly (defaults to expanded, per
`NavGroupSection`'s existing logic). This is a data reconciliation in
`lib/navigation.ts`, not a component rewrite.

**Navigation visibility remains non-authoritative.** Every nav item's
`permission` field is still checked server-side by
`lib/permissions/guard.ts` on the actual route — nothing about this
reconciliation changes that; see "Direct URL access" testing below.

### A known gap this reconciliation does not paper over

The "Eligibility Screening" group's one nav item is "Eligibility
Criteria" — the existing admin screen for *configuring* eligibility
rules, gated by `eligibility.manage_criteria` (`PROGRAMME_DIRECTOR`/
`SYSTEM_ADMIN` only). `ELIGIBILITY_REVIEWER` has `eligibility.review`
(read-only), not `eligibility.manage_criteria`, and there is no
dedicated "view eligibility decisions" route in the application yet —
eligibility decisions are currently only visible inline on the Applicant
Detail page (reachable via "Applicant Import" → Applicants, gated by
`applications.view`, which `ELIGIBILITY_REVIEWER` does have). **The
practical consequence: an Eligibility Reviewer sees no item under
"Eligibility Screening" in the sidebar today.** This reconciliation
deliberately does not build a new screen to fill that gap — that would
be new feature scope (a dedicated eligibility-decisions view), not a
role/permission/navigation reconciliation, and this session's standing
instruction is to refactor/reconcile what exists, not invent
functionality nobody has specified. Flagged here as a concrete follow-up
for whichever phase builds Eligibility Reviewer-facing UI.

### Addendum — Release 1.5

Two additions, both nested inside existing taxonomy groups (no 13th
top-level item, same discipline Phase 3D established for Review
Operations):

- **Administration** gained "Configuration Centre"
  (`/administration/configuration`, `configuration.view`) and "Feature
  Flags" (`/administration/feature-flags`, `feature_flags.manage`).
- **Eligibility Screening** gained "Eligibility Recommendations"
  (`/eligibility-recommendations`, `eligibility_override.execute` —
  Secretariat-only, the triage queue for Eligibility Reviewer flags).

The gap flagged above is now partially closed, not by a new dedicated
"eligibility decisions" screen (still not built — still flagged, still
correctly out of scope for a navigation reconciliation), but because
Release 1.5's Eligibility QA governance work added a real reason for an
`ELIGIBILITY_REVIEWER` to visit the Applicant Detail page: flagging a
questionable outcome and submitting a recommendation (see
`docs/ELIGIBILITY_QA_GOVERNANCE.md`). The sidebar gap for that role is
unchanged — this addendum records a UI capability added elsewhere, not a
navigation-taxonomy fix.
