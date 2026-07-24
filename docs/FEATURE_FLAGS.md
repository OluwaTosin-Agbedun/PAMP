# Feature Flags

Release 1.5 §"Feature Flags", extended by Notification Infrastructure
(Planning Phase 1), Interview Module Completion (Planning Phase 2), and
the Executive Dashboard (Planning Phase 4). Six flags, all stored
through the same audited settings store the Configuration Centre uses
([ADR-0013](adr/ADR-0013-configuration-centre-storage.md)) —
`lib/featureFlags/service.ts` is a purpose-named wrapper, not a
parallel system.

## The flags

| Flag | Default | What it gates |
|---|---|---|
| `feature.interview_module` | **On** | Every staff-facing `/interviews` route — already built and shipped, defaults on to preserve existing behaviour (same precedent as `feature.exports`). |
| `feature.notifications` | Off | The one gate every real outbound send actually checks (`modules/notifications`) — off by default so nothing sends until an administrator deliberately turns it on. |
| `feature.executive_dashboard` | Off | `/executive-approval` — the cohort summary and the Top 70/Top 60/Final Selection/Verification & Confirmation staged sign-off. Brand new, never reachable before this route existed, so this defaults off until an administrator turns it on — not the "already shipped" precedent `feature.interview_module`/`feature.exports` use. |
| `feature.exports` | **On** | Phase 3D's Review Operations CSV export — already built and shipped, so this defaults on to preserve existing behaviour. |
| `feature.analytics` | Off | No analytics module exists yet — reserved. |
| `feature.ai_assistant` | Off | Not built — reserved, as named in the brief. |

## How a flag actually gates something

"No feature should require code removal to disable" — every flag is an
`if (!(await isFeatureEnabled(FEATURE_FLAGS.X))) { ...deny... }` check
at the feature's existing entry point, never a deleted code path.

Four flags gate a real, already-built feature:

- `feature.exports` — `app/(dashboard)/review-operations/assignments/export/route.ts`
  returns `403` if off, independent of `review_operations.export`; the
  "Export CSV" button is hidden (not just disabled) on the assignments
  page when off.
- `feature.interview_module` — `app/(dashboard)/interviews/layout.tsx`
  wraps every nested route (scheduling, scoring, questions,
  availability, oversight) and `notFound()`s the whole subtree when
  off. Deliberately does **not** gate the applicant-facing
  `/interview/book/[token]` booking page — an applicant with a live
  booking link must never see it stop working because a staff-facing
  flag was toggled.
- `feature.notifications` — checked inside `attemptDelivery`
  (`modules/notifications/services/notificationService.ts`), not at a
  route boundary — the admin template/monitoring screens stay visible
  regardless (useful to configure ahead of turning delivery on); only
  the actual send attempt is gated. A send attempted while off is
  recorded `FAILED` with a clear reason, never silently skipped.
- `feature.executive_dashboard` — `app/(dashboard)/executive-approval/layout.tsx`,
  the same `notFound()`-the-whole-subtree pattern `feature.interview_module`
  uses, but defaulting **off** rather than on — this route never
  existed before Planning Phase 4, so there's no "preserve existing
  behaviour" to protect.

The other two flags currently gate nothing (their features don't
exist) — flipping one on today has no visible effect, which is the
honest state of things until the corresponding phase ships.

## Access

`/administration/feature-flags`, gated by `feature_flags.manage` —
**System Administrator only**, deliberately narrower than the
Configuration Centre's Director/Secretary/Admin access: toggling a flag
is a platform-level switch, not a programme-operational value.

## Audit

Every toggle goes through the same `setSettingValue` write path as any
other setting — a `CONFIGURATION_UPDATED` audit row, `category:
"feature"` in its metadata. `AUDIT_ACTIONS.FEATURE_FLAG_CHANGED` exists
in the catalogue for a future screen that wants to filter the Audit
Trail to flag changes specifically, but no second, duplicate audit row
is written to support that today — `entityType`/`metadata.key` already
make a flag change filterable.

## Testing

`tests/integration/release1_5Configuration.test.ts`: defaults confirmed
(`exports` and `interview_module` on, the rest off); only
`SYSTEM_ADMIN` can manage flags (a Programme Secretary is denied); a
toggle persists and is immediately readable through
`isFeatureEnabled`.
