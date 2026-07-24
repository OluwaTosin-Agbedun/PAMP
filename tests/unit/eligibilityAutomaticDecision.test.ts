import { describe, expect, it } from "vitest";

import { AUTOMATIC_GATE_ITEMS, decideAutomaticEligibility, type GateItemRecord } from "@/modules/eligibility/automaticDecision";

function allPassing(overrides: Partial<Record<string, GateItemRecord["status"]>> = {}): GateItemRecord[] {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(overrides, key);
  return [
    ...AUTOMATIC_GATE_ITEMS.map(({ section, itemKey }) => ({
      section,
      itemKey,
      status: has(itemKey) ? overrides[itemKey]! : "PASS",
    })),
    {
      section: "INTEGRITY" as const,
      itemKey: "DUPLICATE_APPLICATION",
      status: has("DUPLICATE_APPLICATION") ? overrides.DUPLICATE_APPLICATION! : "CLEAR",
    },
  ];
}

describe("decideAutomaticEligibility", () => {
  it("returns ELIGIBLE once every gate item passes and the duplicate check is clear", () => {
    const result = decideAutomaticEligibility(allPassing());
    expect(result.outcome).toBe("ELIGIBLE");
    expect(result.failedItems).toEqual([]);
    expect(result.clarifyItems).toEqual([]);
  });

  it("returns INELIGIBLE when any gate item explicitly FAILs", () => {
    const result = decideAutomaticEligibility(allPassing({ NIGERIAN_CITIZEN: "FAIL" }));
    expect(result.outcome).toBe("INELIGIBLE");
    expect(result.failedItems).toContain("NIGERIAN_CITIZEN");
  });

  it("returns DISQUALIFIED when the duplicate check is FLAGged, even if every other item passes", () => {
    const result = decideAutomaticEligibility(allPassing({ DUPLICATE_APPLICATION: "FLAG" }));
    expect(result.outcome).toBe("DISQUALIFIED");
    expect(result.failedItems).toEqual([]);
    expect(result.clarifyItems).toEqual([]);
  });

  it("DISQUALIFIED from a duplicate flag takes priority over an unrelated FAIL", () => {
    const result = decideAutomaticEligibility(allPassing({ DUPLICATE_APPLICATION: "FLAG", NIGERIAN_CITIZEN: "FAIL" }));
    expect(result.outcome).toBe("DISQUALIFIED");
  });

  it("returns CLARIFICATION_REQUIRED when a gate item is still CLARIFY", () => {
    const result = decideAutomaticEligibility(allPassing({ CV: "CLARIFY" }));
    expect(result.outcome).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarifyItems).toContain("CV");
  });

  it("treats a missing (never-evaluated) gate item the same as CLARIFY, not a silent pass", () => {
    const items = allPassing().filter((i) => i.itemKey !== "CV");
    const result = decideAutomaticEligibility(items);
    expect(result.outcome).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarifyItems).toContain("CV");
  });

  it("treats a null status the same as CLARIFY", () => {
    const result = decideAutomaticEligibility(allPassing({ CV: null }));
    expect(result.outcome).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarifyItems).toContain("CV");
  });

  it("root-cause regression: an empty item list is CLARIFICATION_REQUIRED, never a vacuous ELIGIBLE", () => {
    const result = decideAutomaticEligibility([]);
    expect(result.outcome).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarifyItems.length).toBe(AUTOMATIC_GATE_ITEMS.length);
  });

  it("FAIL takes priority over CLARIFY when both are present", () => {
    const result = decideAutomaticEligibility(allPassing({ NIGERIAN_CITIZEN: "FAIL", CV: "CLARIFY" }));
    expect(result.outcome).toBe("INELIGIBLE");
    expect(result.failedItems).toContain("NIGERIAN_CITIZEN");
  });

  it("never gates on items requiring genuine human judgement (e.g. Leadership Potential)", () => {
    const gatedKeys = AUTOMATIC_GATE_ITEMS.map((g) => g.itemKey);
    expect(gatedKeys).not.toContain("LEADERSHIP_POTENTIAL");
    expect(gatedKeys).not.toContain("ETHICAL_ORIENTATION");
    expect(gatedKeys).not.toContain("MIN_QUALIFICATION");
    expect(gatedKeys).not.toContain("WRITTEN_RESPONSE_AUTHENTICITY");
  });
});
