# ADR-0012: Data Minimisation in the Operational Export

**Status**: Accepted (Phase 3D)

## Context

The brief requires an "operational export" (CSV, Excel-compatible) of
the Assignment Monitoring table, gated by permission and programme/
cohort boundaries, respecting "data-minimisation," auditable, and
explicitly forbidding exposure of "password/session/secret/unrelated
sensitive fields." It does not enumerate exactly which columns belong in
the file.

## Decision

### Column set: operational status only, not scores/comments/emails

`exportAssignmentMonitoringCsv`
(`modules/reviewOperations/services/exportService.ts`) exports:
Application Number, Applicant Name, Pathway, Overall Status, Reviewers
(slot + name summary), Conflict Flagged, Third Review Triggered,
Overdue, Assigned Date, Due Date. It deliberately excludes applicant/
reviewer email addresses and individual reviewer scores/comments, even
though the on-screen Assignment Monitoring table and application detail
page show some of that same information to an authorised, authenticated
Secretary.

The distinction is distribution risk, not sensitivity classification: an
authenticated on-screen view is bound to a session, is not persisted
outside the browser, and every view is itself an audit-visible read.
A downloaded file has none of those properties once it leaves the
browser — it can be forwarded, stored on a laptop, or attached to an
email with no further system control. Minimising what a *file* contains,
independent of what the *screen* is allowed to show the same viewer, is
the more conservative reading of "data-minimisation" for an artifact
whose onward handling the system can no longer observe.

### Distinct permission from viewing

`REVIEW_OPERATIONS_EXPORT` (`review_operations.export`) is a separate
permission from `REVIEW_OPERATIONS_VIEW` (`review_operations.view`),
even though every role that has view access in this phase also has
export access (`PROGRAMME_SECRETARY`, `PROGRAMME_DIRECTOR`,
`SYSTEM_ADMIN` — see `lib/permissions/rolePermissions.ts`'s
`PROGRAMME_OVERSIGHT` group). This is deliberate: viewing an
authenticated, audit-visible screen and producing a portable, un-audited-
by-default file are different-risk actions, and a future role that
should see the dashboard but not extract data from it (an auditor,
say) can be granted one permission without the other with no code
change.

### "Excel-compatible" via UTF-8-BOM CSV, not a generated `.xlsx`

The export is CSV with a UTF-8 byte-order-mark prefix (opens correctly
in Excel without a manual "import as UTF-8" step), not a generated
`.xlsx` binary. The `xlsx` package is already a dependency, but only
used, read-only, by Sequence 1's applicant import — writing a `.xlsx`
here would be the first write use of that dependency, for a requirement
("Excel-compatible") the CSV+BOM approach already satisfies without it.

### Audit event on every export

Every successful export writes a `REVIEW_OPERATIONS_EXPORTED` audit row
(`lib/audit/actions.ts`) recording the actor and `rowCount` — the
brief's "include an export audit event" requirement — before the file is
returned; a failed permission check never reaches the write.

## Alternatives considered

**Include reviewer scores/comments, since the on-screen detail page
already shows them to the same Secretary role.** Rejected — see
"distribution risk, not sensitivity classification" above.

**One combined `review_operations.view` permission covering both
viewing and exporting.** Rejected — see "distinct permission" above;
splitting them costs one permission identifier and is free to leave
unused by any role that doesn't need the distinction yet.

**Generate a real `.xlsx` file.** Rejected for this phase as
unnecessary scope beyond what "Excel-compatible" requires; noted here as
the natural upgrade path if a future requirement needs native Excel
features (multiple sheets, cell formatting) a CSV can't express.

## Consequences

- Any future column added to the export must be evaluated against the
  same distribution-risk question, not simply "is the Secretary already
  allowed to see this on screen."
- A role wanting export without dashboard access (or vice versa) is a
  one-line permission-grant change, not a code change.
- If a genuine `.xlsx` need arises later, only `exportService.ts` and
  the export Route Handler need to change — the permission, audit event,
  and column-minimisation decisions carry over unchanged.
