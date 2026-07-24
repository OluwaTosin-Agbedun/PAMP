import { describe, expect, it } from "vitest";

import { evaluateSubmissionThreshold, isScoringThresholdMet } from "@/modules/interviews/domain/scoringThreshold";

function score(panelistId: string, status: "DRAFT" | "SUBMITTED" | "RECUSED") {
  return { panelistId, status };
}

describe("evaluateSubmissionThreshold", () => {
  it("returns ALL_SUBMITTED when every active panellist has submitted (4 of 4)", () => {
    const result = evaluateSubmissionThreshold(
      ["p1", "p2", "p3", "p4"],
      ["p1", "p2", "p3", "p4"].map((id) => score(id, "SUBMITTED")),
    );
    expect(result).toEqual({ status: "ALL_SUBMITTED", activeCount: 4, submittedCount: 4, missingPanelistId: null });
  });

  it("returns OVERRIDE_ELIGIBLE when exactly one of four active panellists is missing", () => {
    const result = evaluateSubmissionThreshold(
      ["p1", "p2", "p3", "p4"],
      [score("p1", "SUBMITTED"), score("p2", "SUBMITTED"), score("p3", "SUBMITTED"), score("p4", "DRAFT")],
    );
    expect(result).toEqual({ status: "OVERRIDE_ELIGIBLE", activeCount: 4, submittedCount: 3, missingPanelistId: "p4" });
  });

  it("returns INCOMPLETE when fewer than three have submitted", () => {
    const result = evaluateSubmissionThreshold(
      ["p1", "p2", "p3", "p4"],
      [score("p1", "SUBMITTED"), score("p2", "SUBMITTED"), score("p3", "DRAFT"), score("p4", "DRAFT")],
    );
    expect(result).toEqual({ status: "INCOMPLETE", activeCount: 4, submittedCount: 2, missingPanelistId: null });
  });

  it("returns OVERRIDE_NOT_ELIGIBLE when three have submitted but more than one is still missing (shrunk active panel)", () => {
    // Active panel of 5 (unusual but structurally possible), 3 submitted, 2 missing.
    const result = evaluateSubmissionThreshold(
      ["p1", "p2", "p3", "p4", "p5"],
      [score("p1", "SUBMITTED"), score("p2", "SUBMITTED"), score("p3", "SUBMITTED"), score("p4", "DRAFT"), score("p5", "DRAFT")],
    );
    expect(result.status).toBe("OVERRIDE_NOT_ELIGIBLE");
    expect(result.missingPanelistId).toBeNull();
  });

  it("is active-panel-size-aware, not hardcoded to 4 — ALL_SUBMITTED is reachable on a shrunk panel of 3", () => {
    // A seat was cancelled and never replaced (cancelPanelist doesn't auto-reassign), leaving 3 active panellists.
    const result = evaluateSubmissionThreshold(
      ["p1", "p2", "p3"],
      [score("p1", "SUBMITTED"), score("p2", "SUBMITTED"), score("p3", "SUBMITTED")],
    );
    expect(result).toEqual({ status: "ALL_SUBMITTED", activeCount: 3, submittedCount: 3, missingPanelistId: null });
  });

  it("never returns OVERRIDE_ELIGIBLE on a panel of 3 — one missing there always leaves fewer than three valid submissions", () => {
    // With only 3 active seats, 1 missing means at most 2 valid — the override's own 3-valid floor
    // (§2.6) makes this state unreachable, distinct from the 4-seat case where 1 missing still leaves 3 valid.
    const result = evaluateSubmissionThreshold(
      ["p1", "p2", "p3"],
      [score("p1", "SUBMITTED"), score("p2", "SUBMITTED"), score("p3", "DRAFT")],
    );
    expect(result).toEqual({ status: "INCOMPLETE", activeCount: 3, submittedCount: 2, missingPanelistId: null });
  });

  it("reaches OVERRIDE_ELIGIBLE on a larger-than-4 active panel too, proving the check isn't a literal comparison against 4", () => {
    const result = evaluateSubmissionThreshold(
      ["p1", "p2", "p3", "p4", "p5"],
      [score("p1", "SUBMITTED"), score("p2", "SUBMITTED"), score("p3", "SUBMITTED"), score("p4", "SUBMITTED"), score("p5", "DRAFT")],
    );
    expect(result).toEqual({ status: "OVERRIDE_ELIGIBLE", activeCount: 5, submittedCount: 4, missingPanelistId: "p5" });
  });

  it("ignores RECUSED and DRAFT scores the same way — only SUBMITTED counts", () => {
    const result = evaluateSubmissionThreshold(
      ["p1", "p2", "p3", "p4"],
      [score("p1", "SUBMITTED"), score("p2", "SUBMITTED"), score("p3", "SUBMITTED"), score("p4", "RECUSED")],
    );
    expect(result.status).toBe("OVERRIDE_ELIGIBLE");
    expect(result.missingPanelistId).toBe("p4");
  });
});

describe("isScoringThresholdMet", () => {
  it("is true when ALL_SUBMITTED, regardless of override state", () => {
    const allSubmitted = evaluateSubmissionThreshold(["p1"], [score("p1", "SUBMITTED")]);
    expect(isScoringThresholdMet(allSubmitted, null)).toBe(true);
  });

  it("is true when an override is set, even with only 3 of 4 submitted", () => {
    const overrideEligible = evaluateSubmissionThreshold(
      ["p1", "p2", "p3", "p4"],
      [score("p1", "SUBMITTED"), score("p2", "SUBMITTED"), score("p3", "SUBMITTED"), score("p4", "DRAFT")],
    );
    expect(isScoringThresholdMet(overrideEligible, new Date())).toBe(true);
  });

  it("is false at 3 of 4 submitted with no override — reaching 3 alone does not unlock the average", () => {
    const overrideEligible = evaluateSubmissionThreshold(
      ["p1", "p2", "p3", "p4"],
      [score("p1", "SUBMITTED"), score("p2", "SUBMITTED"), score("p3", "SUBMITTED"), score("p4", "DRAFT")],
    );
    expect(isScoringThresholdMet(overrideEligible, null)).toBe(false);
  });
});
