import { describe, expect, it } from "vitest";

import {
  canDecideStage,
  latestDecisionByStage,
  nextActionableStage,
  withinStageBracket,
  workflowStatusFor,
} from "@/modules/executiveApproval/domain/executiveApproval";

describe("latestDecisionByStage", () => {
  it("keeps only the most recent decision per stage, regardless of input order", () => {
    const map = latestDecisionByStage([
      { stage: "TOP_70", decision: "REJECTED", createdAt: new Date("2026-01-01") },
      { stage: "TOP_70", decision: "APPROVED", createdAt: new Date("2026-01-02") },
    ]);
    expect(map.get("TOP_70")).toBe("APPROVED");
  });

  it("returns an empty map for no prior decisions", () => {
    expect(latestDecisionByStage([]).size).toBe(0);
  });
});

describe("canDecideStage", () => {
  it("allows TOP_70 unconditionally when nothing has been decided yet", () => {
    expect(canDecideStage("TOP_70", new Map())).toEqual({ allowed: true });
  });

  it("blocks TOP_60 until TOP_70 is approved", () => {
    const result = canDecideStage("TOP_60", new Map());
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("Top 70");
  });

  it("blocks TOP_60 while TOP_70's latest decision is REJECTED", () => {
    const latest = new Map([["TOP_70", "REJECTED"]] as const);
    expect(canDecideStage("TOP_60", latest).allowed).toBe(false);
  });

  it("allows TOP_60 once TOP_70 is APPROVED", () => {
    const latest = new Map([["TOP_70", "APPROVED"]] as const);
    expect(canDecideStage("TOP_60", latest)).toEqual({ allowed: true });
  });

  it("blocks re-deciding a stage that is already APPROVED", () => {
    const latest = new Map([["TOP_70", "APPROVED"]] as const);
    const result = canDecideStage("TOP_70", latest);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("already been approved");
  });

  it("allows re-deciding a stage whose latest decision is REJECTED", () => {
    const latest = new Map([["TOP_70", "REJECTED"]] as const);
    expect(canDecideStage("TOP_70", latest)).toEqual({ allowed: true });
  });

  it("requires every prior stage approved before VERIFICATION_CONFIRMATION, not just the immediately preceding one", () => {
    const latest = new Map([
      ["TOP_70", "APPROVED"],
      ["TOP_60", "APPROVED"],
      // FINAL_SELECTION never decided
    ] as const);
    const result = canDecideStage("VERIFICATION_CONFIRMATION", latest);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("Final Selection");
  });
});

describe("workflowStatusFor", () => {
  it("composes stage and decision into a readable status string", () => {
    expect(workflowStatusFor("TOP_70", "APPROVED")).toBe("TOP_70_APPROVED");
    expect(workflowStatusFor("FINAL_SELECTION", "REJECTED")).toBe("FINAL_SELECTION_REJECTED");
  });
});

describe("nextActionableStage", () => {
  it("returns TOP_70 when nothing has been decided yet", () => {
    expect(nextActionableStage(new Map())).toBe("TOP_70");
  });

  it("returns the next stage in order as each prior one is approved", () => {
    expect(nextActionableStage(new Map([["TOP_70", "APPROVED"]] as const))).toBe("TOP_60");
    expect(
      nextActionableStage(
        new Map([
          ["TOP_70", "APPROVED"],
          ["TOP_60", "APPROVED"],
        ] as const),
      ),
    ).toBe("FINAL_SELECTION");
  });

  it("returns the same stage again after a rejection, not the next one", () => {
    expect(nextActionableStage(new Map([["TOP_70", "REJECTED"]] as const))).toBe("TOP_70");
  });

  it("returns null once every stage is approved", () => {
    const latest = new Map([
      ["TOP_70", "APPROVED"],
      ["TOP_60", "APPROVED"],
      ["FINAL_SELECTION", "APPROVED"],
      ["VERIFICATION_CONFIRMATION", "APPROVED"],
    ] as const);
    expect(nextActionableStage(latest)).toBeNull();
  });
});

describe("withinStageBracket", () => {
  it("TOP_70 and TOP_60 use fixed literal thresholds, independent of targetSize", () => {
    expect(withinStageBracket(70, "TOP_70", 30)).toBe(true);
    expect(withinStageBracket(71, "TOP_70", 30)).toBe(false);
    expect(withinStageBracket(60, "TOP_60", 30)).toBe(true);
    expect(withinStageBracket(61, "TOP_60", 30)).toBe(false);
  });

  it("FINAL_SELECTION and VERIFICATION_CONFIRMATION both use the snapshot's actual targetSize", () => {
    expect(withinStageBracket(30, "FINAL_SELECTION", 30)).toBe(true);
    expect(withinStageBracket(31, "FINAL_SELECTION", 30)).toBe(false);
    expect(withinStageBracket(30, "VERIFICATION_CONFIRMATION", 30)).toBe(true);
    expect(withinStageBracket(31, "VERIFICATION_CONFIRMATION", 30)).toBe(false);
  });
});
