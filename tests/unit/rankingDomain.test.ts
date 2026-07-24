import { describe, expect, it } from "vitest";

import { Prisma } from "@/lib/generated/prisma/client";
import {
  calculateCompositeScore,
  decisionBandFor,
  determineRankingEligibility,
  rankApplications,
  type RankableApplication,
} from "@/modules/ranking/domain/ranking";

function app(id: string, composite: number, interview: number, review: number): RankableApplication {
  return {
    applicationId: id,
    compositeScore: new Prisma.Decimal(composite),
    interviewAverage: new Prisma.Decimal(interview),
    reviewAverage: new Prisma.Decimal(review),
  };
}

describe("calculateCompositeScore", () => {
  it("is a straight sum of the two components, no weighting", () => {
    expect(calculateCompositeScore(60, 40).toString()).toBe("100");
    expect(calculateCompositeScore(0, 0).toString()).toBe("0");
  });

  it("matches the addendum's own worked total (60 + 40 = 100)", () => {
    expect(calculateCompositeScore("60", "40").toString()).toBe("100");
  });

  it("handles decimal averages", () => {
    expect(calculateCompositeScore("45.5", "32.25").toString()).toBe("77.75");
  });

  it("rounds to 2 decimal places, ROUND_HALF_UP", () => {
    expect(calculateCompositeScore("10.005", "0").toString()).toBe("10.01");
  });
});

describe("decisionBandFor", () => {
  it("bands per the PAM-P 2026 Metrics Framework §9", () => {
    expect(decisionBandFor(100)).toBe("STRONGLY_RECOMMENDED");
    expect(decisionBandFor(85)).toBe("STRONGLY_RECOMMENDED");
    expect(decisionBandFor(84.99)).toBe("RECOMMENDED");
    expect(decisionBandFor(75)).toBe("RECOMMENDED");
    expect(decisionBandFor(74.99)).toBe("RESERVE_BORDERLINE");
    expect(decisionBandFor(65)).toBe("RESERVE_BORDERLINE");
    expect(decisionBandFor(64.99)).toBe("NOT_RECOMMENDED");
    expect(decisionBandFor(0)).toBe("NOT_RECOMMENDED");
  });
});

describe("determineRankingEligibility", () => {
  const base = {
    eligibilityStatus: "ELIGIBLE" as const,
    deletedAt: null,
    isWithdrawn: false,
    reviewAverage: new Prisma.Decimal(50),
    interviewAverage: new Prisma.Decimal(35),
    hasIntegrityHold: false,
  };

  it("is eligible when every condition is satisfied", () => {
    expect(determineRankingEligibility(base)).toEqual({ eligible: true });
  });

  it("excludes a withdrawn (soft-deleted) application first, regardless of other flags", () => {
    const result = determineRankingEligibility({ ...base, deletedAt: new Date(), eligibilityStatus: "PENDING" });
    expect(result).toEqual({ eligible: false, reason: "APPLICATION_WITHDRAWN" });
  });

  it("excludes a staff-recorded withdrawal (isWithdrawn) the same as a soft delete", () => {
    const result = determineRankingEligibility({ ...base, isWithdrawn: true, eligibilityStatus: "PENDING" });
    expect(result).toEqual({ eligible: false, reason: "APPLICATION_WITHDRAWN" });
  });

  it("excludes an application that isn't marked ELIGIBLE", () => {
    expect(determineRankingEligibility({ ...base, eligibilityStatus: "PENDING" })).toEqual({
      eligible: false,
      reason: "APPLICATION_NOT_ELIGIBLE",
    });
  });

  it("excludes an integrity hold ahead of missing scores", () => {
    expect(determineRankingEligibility({ ...base, hasIntegrityHold: true, reviewAverage: null })).toEqual({
      eligible: false,
      reason: "INTEGRITY_HOLD",
    });
  });

  it("excludes when the application review score is missing", () => {
    expect(determineRankingEligibility({ ...base, reviewAverage: null })).toEqual({
      eligible: false,
      reason: "MISSING_REVIEW_SCORE",
    });
  });

  it("excludes when the interview score is missing", () => {
    expect(determineRankingEligibility({ ...base, interviewAverage: null })).toEqual({
      eligible: false,
      reason: "MISSING_INTERVIEW_SCORE",
    });
  });
});

describe("rankApplications", () => {
  it("ranks highest composite score first", () => {
    const { entries } = rankApplications([app("a", 70, 30, 40), app("b", 90, 40, 50), app("c", 80, 35, 45)]);
    expect(entries.map((e) => e.applicationId)).toEqual(["b", "c", "a"]);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("Level 1: a composite tie is broken by the higher interview score, without flagging a Level 3 tie", () => {
    const { entries, tieGroups } = rankApplications([app("a", 80, 30, 50), app("b", 80, 35, 45)]);
    expect(entries.map((e) => e.applicationId)).toEqual(["b", "a"]);
    expect(entries.every((e) => !e.tieLevel3)).toBe(true);
    expect(tieGroups).toHaveLength(0);
  });

  it("Level 2: a tie on both composite and interview score is broken by the higher review score", () => {
    const { entries, tieGroups } = rankApplications([app("a", 80, 30, 50), app("b", 80, 30, 55)]);
    expect(entries.map((e) => e.applicationId)).toEqual(["b", "a"]);
    expect(entries.every((e) => !e.tieLevel3)).toBe(true);
    expect(tieGroups).toHaveLength(0);
  });

  it("Level 3: identical composite, interview, and review scores produce a flagged tie group", () => {
    const { entries, tieGroups } = rankApplications([app("a", 80, 30, 50), app("b", 80, 30, 50)]);
    expect(entries.every((e) => e.tieLevel3)).toBe(true);
    expect(tieGroups).toHaveLength(1);
    expect(tieGroups[0].applicationIds.sort()).toEqual(["a", "b"]);
  });

  it("assigns distinct, deterministic ranks even within a Level 3 tie group", () => {
    const { entries } = rankApplications([app("b", 80, 30, 50), app("a", 80, 30, 50)]);
    const ranks = entries.map((e) => e.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    // applicationId-ascending is the documented deterministic storage order.
    expect(entries.map((e) => e.applicationId)).toEqual(["a", "b"]);
  });

  it("is deterministic regardless of input order", () => {
    const applications = [app("a", 70, 30, 40), app("b", 90, 40, 50), app("c", 80, 35, 45)];
    const forward = rankApplications(applications).entries.map((e) => e.applicationId);
    const reversed = rankApplications([...applications].reverse()).entries.map((e) => e.applicationId);
    expect(forward).toEqual(reversed);
  });

  it("only flags applications that are actually tied, not the whole list", () => {
    const { entries, tieGroups } = rankApplications([app("a", 90, 40, 50), app("b", 80, 30, 50), app("c", 80, 30, 50)]);
    expect(entries.find((e) => e.applicationId === "a")!.tieLevel3).toBe(false);
    expect(entries.find((e) => e.applicationId === "b")!.tieLevel3).toBe(true);
    expect(entries.find((e) => e.applicationId === "c")!.tieLevel3).toBe(true);
    expect(tieGroups).toHaveLength(1);
  });

  it("handles an empty input", () => {
    expect(rankApplications([])).toEqual({ entries: [], tieGroups: [] });
  });
});
