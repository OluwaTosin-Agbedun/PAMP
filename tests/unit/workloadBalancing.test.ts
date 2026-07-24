import { describe, expect, it } from "vitest";

import { isAtCapacity, selectLeastLoadedReviewers, type ReviewerWorkload } from "@/modules/reviews/domain/workloadBalancing";

function workload(reviewerId: string, activeAssignmentCount: number, maxConcurrentAssignments = 10): ReviewerWorkload {
  return { reviewerId, activeAssignmentCount, maxConcurrentAssignments };
}

describe("isAtCapacity", () => {
  it("is at capacity when active count equals the max", () => {
    expect(isAtCapacity(workload("r1", 10, 10))).toBe(true);
  });

  it("is at capacity when active count exceeds the max", () => {
    expect(isAtCapacity(workload("r1", 11, 10))).toBe(true);
  });

  it("is not at capacity when active count is below the max", () => {
    expect(isAtCapacity(workload("r1", 9, 10))).toBe(false);
  });
});

describe("selectLeastLoadedReviewers", () => {
  it("picks the reviewers with the fewest active assignments first", () => {
    const candidates = [workload("heavy", 5), workload("light", 1), workload("medium", 3)];
    const { selected } = selectLeastLoadedReviewers(candidates, 2);
    expect(selected).toEqual(["light", "medium"]);
  });

  it("never selects a reviewer at or over capacity", () => {
    const candidates = [workload("full", 10, 10), workload("open", 8, 10)];
    const { selected } = selectLeastLoadedReviewers(candidates, 2);
    expect(selected).toEqual(["open"]);
    expect(selected).not.toContain("full");
  });

  it("returns fewer than requested when not enough eligible candidates exist — never throws itself", () => {
    const candidates = [workload("only", 0)];
    const { selected, remaining } = selectLeastLoadedReviewers(candidates, 2);
    expect(selected).toEqual(["only"]);
    expect(remaining).toEqual([]);
  });

  it("distributes evenly across many equal-load candidates over repeated calls (no single reviewer always wins ties)", () => {
    const candidates = Array.from({ length: 5 }, (_, i) => workload(`r${i}`, 0));
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { selected } = selectLeastLoadedReviewers(candidates, 1);
      picks.add(selected[0]);
    }
    // With 40 draws across 5 equally-loaded candidates, a real shuffle
    // should surface more than just one candidate.
    expect(picks.size).toBeGreaterThan(1);
  });
});
