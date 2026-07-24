# ADR-0013: Extend `SystemSetting`, Don't Build Seven New Tables

**Status**: Accepted (Release 1.5)

## Context

Release 1.5's brief asks for seven configuration categories (Programme,
Review, Interview, Scoring, Notification, File Upload, Security) plus a
Feature Flags system, roughly 40 individual values in total. The
codebase already has a `SystemSetting` model (database-design phase,
`prisma/schema.prisma`): a generic `key`/`value` (JSON) table with an
`updatedById` audit pointer, and a two-key typed accessor module
(`lib/settings/service.ts`) Phase 3B built for exactly this purpose —
its own doc comment already promised "the one typed accessor module"
for admin-tunable settings.

## Decision

Extend `SystemSetting` and `lib/settings/service.ts` rather than
introducing a table per category. A single registry
(`lib/settings/registry.ts`, `SETTINGS_REGISTRY: SettingDefinition[]`)
declares every setting's key, category, type (`number`/`boolean`/
`string`), label, description, default, valid range/options, and
whether it's genuinely live-editable or read-only/informational — one
array is the source of truth for the generic accessor functions
(`getSettingValue`/`setSettingValue`), the Zod-free validation inside
`setSettingValue` itself, and the Configuration Centre's UI (one generic
category-driven form renderer, not seven hand-built ones).

Feature flags reuse the exact same mechanism (`category: "feature"`
entries in the same registry), exposed to the rest of the codebase
through a purpose-named wrapper (`lib/featureFlags/service.ts`,
`isFeatureEnabled`/`setFeatureFlag`) rather than a parallel storage
system — a flag *is* a boolean setting; inventing a second table for it
would duplicate the audit-on-write, validation, and default-fallback
logic `lib/settings/service.ts` already has.

### What genuinely needed new schema

Three additions, all additive, in one migration:

- `Programme.code` (nullable `String`) — the one Programme identity
  field that didn't already exist.
- `Cohort.applicationOpensAt`/`applicationClosesAt` (nullable
  `DateTime`) — the application intake window; distinct from the
  Application Review Window, which already had a home
  (`ReviewStage.opensAt/closesAt`, Phase 3A).
- `ProgrammeWindow` (new model, `programmeId`/`cohortId`/`code`/
  `opensAt`/`closesAt`) — the four pipeline-stage windows with no
  existing schema home (Eligibility Review, Interview, Executive
  Approval, Offer). `ReviewStage` was deliberately *not* repurposed for
  these — it carries mandatory scoring-specific fields
  (`maxTotalScore`, `status`, `commentsRequired`, etc.) that make no
  sense for a non-scoring window, and forcing four dummy values into
  every row to satisfy `NOT NULL` constraints would be worse than one
  small, honest, purpose-built table.

`AuditLog` needed two additive columns (`requestId`, `sessionId`) for
the audit-enhancement work — see
[ADR-0014](ADR-0014-audit-context-async-local-storage.md).

## Alternatives considered

**A `ProgrammeConfiguration`/`ReviewConfiguration`/... table per
category**, mirroring the brief's category structure directly.
Rejected — most category values (Interview, Notification, most of File
Upload) have zero consumer code this phase (the brief explicitly says
so: "no interview functionality," "do not build the notification
engine"), so seven dedicated tables would mean seven schemas built
almost entirely for values nothing reads yet, when the existing generic
store already handles "store a typed value, audited, with a default"
perfectly well. Seven tables would also mean seven repositories and
seven Zod schemas, duplicating structure the registry-driven approach
gets from one array.

**Storing every setting, including Programme/Cohort/window fields, in
`SystemSetting` too**, for total uniformity. Rejected — `Programme`/
`Cohort` already exist as real tables with real relations
(`ReviewStage`, `Application`, etc.); a programme's name living in a
generic key/value row while everything that references it is a foreign
key would be a worse fit than adding one nullable column.

## Consequences

- Every new setting this codebase adds is one `SETTINGS_REGISTRY` entry
  — no migration, no new repository, no new form.
- The Configuration Centre's screens are thin: `[category]/page.tsx`
  calls one service function and renders one generic list component for
  six of the seven categories; only Programme Configuration (structured,
  not flat) has its own dedicated page.
- A setting that's read-only/informational (blind review, ranking
  method, the third-review formula) is represented honestly in the same
  registry, distinguished by a `readOnly` flag the UI and the write path
  both respect — not silently absent, not fake-editable.
