import type { ChecklistItemStatus, ChecklistSection } from "@/lib/generated/prisma/client";

import { ALL_CHECKLIST_ITEMS } from "./checklistDefinition";

export type ChecklistItemRecord = { section: ChecklistSection; itemKey: string; status: ChecklistItemStatus | null };

const RESOLVED_STATUSES: ChecklistItemStatus[] = ["PASS", "CLEAR"];

/**
 * §8.1 — "All mandatory screening items have been completed" and none
 * outstanding. Eligible is the one decision that requires the *entire*
 * checklist resolved cleanly; Ineligible/Disqualified/Clarification
 * Required are each a screener's decisive call and don't require every
 * other item to have been walked through first (§15 only requires a
 * reason/issue for those, checked separately at the service layer).
 */
export function canMarkEligible(items: ChecklistItemRecord[]): { ok: true } | { ok: false; reason: string } {
  for (const { section, item } of ALL_CHECKLIST_ITEMS) {
    const record = items.find((i) => i.section === section && i.itemKey === item.key);
    if (!record || record.status === null) {
      return { ok: false, reason: `"${item.label}" hasn't been checked yet.` };
    }
    if (!RESOLVED_STATUSES.includes(record.status)) {
      return { ok: false, reason: `"${item.label}" is marked ${record.status} — resolve it before marking Eligible.` };
    }
  }
  return { ok: true };
}
