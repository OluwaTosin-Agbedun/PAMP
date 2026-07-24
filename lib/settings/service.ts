import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { ValidationError } from "@/lib/errors";

import { getSettingDefinition, type SettingDefinition } from "./registry";

/**
 * Typed accessors for `SystemSetting` (the generic key/value config
 * table from the database-design phase). Phase 3B was the first module
 * to read from it (the third-review divergence threshold, the reviewer
 * default capacity); Release 1.5's Configuration Centre generalizes
 * this into the one typed accessor module the schema's original doc
 * comment promised, driven by `./registry.ts`'s `SETTINGS_REGISTRY` —
 * every setting's type, default, valid range, and read-only status live
 * in one place, not duplicated between this file and the UI.
 */

/** Kept for the two named keys Phase 3B's `assignmentService.ts`
 *  already imports by constant — new consumers reference a registry key
 *  string directly (e.g. `SETTINGS_REGISTRY` entries' `.key`), since the
 *  registry, not this object, is now the canonical settings list. */
export const SETTINGS_KEYS = {
  THIRD_REVIEW_DIVERGENCE_THRESHOLD_PERCENT: "review.third_review_divergence_threshold_percent",
  REVIEWER_DEFAULT_MAX_CONCURRENT_ASSIGNMENTS: "review.reviewer_default_max_concurrent_assignments",
  REVIEWERS_PER_APPLICATION: "review.reviewers_per_application",
  AUTOMATIC_ASSIGNMENT_ENABLED: "review.automatic_assignment_enabled",
  CLARIFICATION_DEADLINE_HOURS: "eligibility.clarification_deadline_hours",
} as const;

export type SettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

function requireDefinition(key: string): SettingDefinition {
  const definition = getSettingDefinition(key);
  if (!definition) throw new Error(`Unknown setting key: ${key} (not in SETTINGS_REGISTRY)`);
  return definition;
}

/** Falls back to the registry default when no row exists yet — a fresh
 *  database is usable without a separate "seed the settings" step. */
export async function getSettingValue(key: string): Promise<number | boolean | string> {
  const definition = requireDefinition(key);
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (row) {
    const value = row.value as unknown;
    if (definition.type === "number" && typeof value === "number" && Number.isFinite(value)) return value;
    if (definition.type === "boolean" && typeof value === "boolean") return value;
    if (definition.type === "string" && typeof value === "string") return value;
  }
  return definition.default;
}

export async function getNumericSettingValue(key: string): Promise<number> {
  const value = await getSettingValue(key);
  return typeof value === "number" ? value : Number(value);
}

export async function getBooleanSettingValue(key: string): Promise<boolean> {
  const value = await getSettingValue(key);
  return Boolean(value);
}

export async function getStringSettingValue(key: string): Promise<string> {
  const value = await getSettingValue(key);
  return String(value);
}

function validateValue(definition: SettingDefinition, value: number | boolean | string) {
  if (definition.readOnly) {
    throw new ValidationError(`"${definition.label}" is read-only and cannot be changed.`);
  }
  if (definition.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ValidationError(`"${definition.label}" must be a number.`);
    }
    if (definition.min !== undefined && value < definition.min) {
      throw new ValidationError(`"${definition.label}" must be at least ${definition.min}.`);
    }
    if (definition.max !== undefined && value > definition.max) {
      throw new ValidationError(`"${definition.label}" must be at most ${definition.max}.`);
    }
  } else if (definition.type === "boolean") {
    if (typeof value !== "boolean") throw new ValidationError(`"${definition.label}" must be true or false.`);
  } else {
    if (typeof value !== "string") throw new ValidationError(`"${definition.label}" must be text.`);
    if (definition.options && !definition.options.includes(value)) {
      throw new ValidationError(`"${definition.label}" must be one of: ${definition.options.join(", ")}.`);
    }
  }
}

/**
 * Validates against the setting's registry definition, upserts, and
 * writes a `CONFIGURATION_UPDATED` audit row recording the key, the
 * previous value, and the new value — "all configuration changes must
 * be fully audited" (Release 1.5 brief, verbatim). Every write goes
 * through this one function; there is no other path that touches
 * `SystemSetting`.
 */
export async function setSettingValue(key: string, value: number | boolean | string, actorId: string): Promise<void> {
  const definition = requireDefinition(key);
  validateValue(definition, value);

  const previous = await getSettingValue(key);

  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedById: actorId },
    update: { value: value as Prisma.InputJsonValue, updatedById: actorId },
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.CONFIGURATION_UPDATED,
    entityType: "SystemSetting",
    entityId: key,
    metadata: { key, category: definition.category, from: previous, to: value },
  });
}

/** Kept for Phase 3B's existing call sites (`assignmentService.ts`) —
 *  same name and shape as before generalization. */
export async function getNumericSetting(key: SettingKey): Promise<number> {
  return getNumericSettingValue(key);
}

/** Kept for signature compatibility with the pre-Release-1.5 module;
 *  `updatedById: null` (a system-initiated change with no human actor)
 *  is not supported by the new audited path — every write must have an
 *  actor, per the brief's audit requirement, so this narrows to a
 *  required actor id. No existing call site passed null. */
export async function setNumericSetting(key: SettingKey, value: number, updatedById: string): Promise<void> {
  return setSettingValue(key, value, updatedById);
}

export { SETTINGS_REGISTRY, getSettingDefinition, listSettingsByCategory } from "./registry";
export type { SettingCategory, SettingDefinition, SettingType } from "./registry";
