import { describe, expect, it } from "vitest";

import { pickRandomReviewer } from "@/modules/eligibility/reviewerAssignment";

describe("pickRandomReviewer", () => {
  it("returns null for an empty pool", () => {
    expect(pickRandomReviewer([])).toBeNull();
  });

  it("returns the only candidate when the pool has one", () => {
    expect(pickRandomReviewer(["reviewer-1"])).toBe("reviewer-1");
  });

  it("only ever returns an id from the given pool", () => {
    const pool = ["reviewer-1", "reviewer-2", "reviewer-3"];
    for (let i = 0; i < 200; i++) {
      expect(pool).toContain(pickRandomReviewer(pool));
    }
  });

  it("uses the whole pool over many draws, not just the first entry", () => {
    const pool = ["reviewer-1", "reviewer-2", "reviewer-3"];
    const seen = new Set<string | null>();
    for (let i = 0; i < 200; i++) seen.add(pickRandomReviewer(pool));
    expect(seen.size).toBe(3);
  });
});
