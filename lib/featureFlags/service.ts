import "server-only";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";
import { getBooleanSettingValue, listSettingsByCategory, setSettingValue } from "@/lib/settings/service";

/**
 * Purpose-named wrapper over the shared, audited settings store
 * (`lib/settings/service.ts`) for Release 1.5's enterprise feature
 * flags — callers gating a feature ask `isFeatureEnabled(FEATURE_FLAGS
 * .EXPORTS)`, not "read this SystemSetting key," keeping the flag
 * vocabulary in one place and the storage mechanism an implementation
 * detail. Every flag disables its feature with an if-check at the
 * feature's existing entry point — never by removing code.
 */
export const FEATURE_FLAGS = {
  INTERVIEW_MODULE: "feature.interview_module",
  NOTIFICATIONS: "feature.notifications",
  EXECUTIVE_DASHBOARD: "feature.executive_dashboard",
  EXPORTS: "feature.exports",
  ANALYTICS: "feature.analytics",
  AI_ASSISTANT: "feature.ai_assistant",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export async function isFeatureEnabled(flag: FeatureFlagKey): Promise<boolean> {
  return getBooleanSettingValue(flag);
}

/** Same audited write path every other setting uses
 *  (`CONFIGURATION_UPDATED`, `category: "feature"` in its metadata) —
 *  `AUDIT_ACTIONS.FEATURE_FLAG_CHANGED` exists in the catalogue for a
 *  future screen that wants to filter the Audit Trail to flag changes
 *  specifically, but this function doesn't write a second, duplicate
 *  audit row to do that; `entityType`/`metadata.key` already make a flag
 *  change filterable without a second write. */
export async function setFeatureFlag(flag: FeatureFlagKey, enabled: boolean, actorId: string): Promise<void> {
  await setSettingValue(flag, enabled, actorId);
}

/** Gated by `feature_flags.manage` (System Administrator only) — a
 *  narrower, platform-level permission than the Configuration Centre's
 *  `configuration.view`/`configuration.manage`, per Release 1.5's own
 *  split between the two. Not `getSettingsForCategory` from
 *  `modules/configuration` reused as-is: that function is hardwired to
 *  `configuration.view`, the wrong gate for this screen. */
export async function getFeatureFlagsForAdmin(actorId: string) {
  await requirePermission(actorId, PERMISSIONS.FEATURE_FLAGS_MANAGE);

  const definitions = listSettingsByCategory("feature");
  const values = await Promise.all(definitions.map((d) => getBooleanSettingValue(d.key)));

  return definitions.map((definition, index) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    enabled: values[index],
  }));
}
