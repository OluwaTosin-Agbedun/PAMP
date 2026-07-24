import { describe, expect, it } from "vitest";

import { ALL_CHECKLIST_ITEMS } from "@/modules/eligibility/checklistDefinition";
import { canMarkEligible, type ChecklistItemRecord } from "@/modules/eligibility/checklistValidation";

function allResolved(overrides: Partial<Record<string, ChecklistItemRecord["status"]>> = {}): ChecklistItemRecord[] {
  return ALL_CHECKLIST_ITEMS.map(({ section, item }) => ({
    section,
    itemKey: item.key,
    status: overrides[item.key] ?? (section === "INTEGRITY" ? "CLEAR" : "PASS"),
  }));
}

describe("canMarkEligible", () => {
  it("allows Eligible once every item is resolved cleanly", () => {
    expect(canMarkEligible(allResolved())).toEqual({ ok: true });
  });

  it("blocks Eligible when any item hasn't been checked at all", () => {
    const items = allResolved().filter((i) => i.itemKey !== "CV");
    const result = canMarkEligible(items);
    expect(result.ok).toBe(false);
  });

  it("blocks Eligible when any item is still marked CLARIFY", () => {
    const result = canMarkEligible(allResolved({ CV: "CLARIFY" }));
    expect(result.ok).toBe(false);
  });

  it("blocks Eligible when any item is marked FAIL", () => {
    const result = canMarkEligible(allResolved({ NIGERIAN_CITIZEN: "FAIL" }));
    expect(result.ok).toBe(false);
  });

  it("blocks Eligible when any integrity item is FLAGged", () => {
    const result = canMarkEligible(allResolved({ DUPLICATE_APPLICATION: "FLAG" }));
    expect(result.ok).toBe(false);
  });

  it("blocks Eligible on an empty checklist", () => {
    expect(canMarkEligible([]).ok).toBe(false);
  });
});
