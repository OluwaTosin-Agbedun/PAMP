import { describe, expect, it } from "vitest";

import { matchApplicationPathway, pathwayLabel, seededRandom, selectAutoAskedQuestions } from "@/modules/interviews/domain/interviewQuestions";

describe("matchApplicationPathway", () => {
  it("matches the canonical label exactly", () => {
    expect(matchApplicationPathway("Entrepreneurship & Enterprise")).toBe("ENTREPRENEURSHIP_ENTERPRISE");
    expect(matchApplicationPathway("Public & Private Sector Leadership")).toBe("PUBLIC_PRIVATE_SECTOR_LEADERSHIP");
    expect(matchApplicationPathway("Academia & Advanced Studies")).toBe("ACADEMIA_ADVANCED_STUDIES");
  });

  it("matches case-insensitively and trims whitespace", () => {
    expect(matchApplicationPathway("  entrepreneurship & enterprise  ")).toBe("ENTREPRENEURSHIP_ENTERPRISE");
    expect(matchApplicationPathway("ACADEMIA & ADVANCED STUDIES")).toBe("ACADEMIA_ADVANCED_STUDIES");
  });

  it("returns null for null, undefined, empty, or unrecognized values — never throws", () => {
    expect(matchApplicationPathway(null)).toBeNull();
    expect(matchApplicationPathway(undefined)).toBeNull();
    expect(matchApplicationPathway("")).toBeNull();
    expect(matchApplicationPathway("   ")).toBeNull();
    expect(matchApplicationPathway("Something else entirely")).toBeNull();
  });
});

describe("pathwayLabel", () => {
  it("returns the canonical display label for each pathway", () => {
    expect(pathwayLabel("ENTREPRENEURSHIP_ENTERPRISE")).toBe("Entrepreneurship & Enterprise");
    expect(pathwayLabel("PUBLIC_PRIVATE_SECTOR_LEADERSHIP")).toBe("Public & Private Sector Leadership");
    expect(pathwayLabel("ACADEMIA_ADVANCED_STUDIES")).toBe("Academia & Advanced Studies");
  });
});

type TestQuestion = {
  id: string;
  category: "MANDATORY" | "PATHWAY" | "SITUATIONAL" | "ADDITIONAL_BANK";
  pathway: "ENTREPRENEURSHIP_ENTERPRISE" | "PUBLIC_PRIVATE_SECTOR_LEADERSHIP" | "ACADEMIA_ADVANCED_STUDIES" | null;
  isActive: boolean;
};

function question(overrides: Partial<TestQuestion>): TestQuestion {
  return {
    id: overrides.id ?? "q1",
    category: overrides.category ?? "MANDATORY",
    pathway: overrides.pathway ?? null,
    isActive: overrides.isActive ?? true,
  };
}

describe("selectAutoAskedQuestions", () => {
  it("includes every active mandatory question regardless of pathway", () => {
    const questions = [question({ id: "m1", category: "MANDATORY" }), question({ id: "m2", category: "MANDATORY" })];
    expect(selectAutoAskedQuestions(questions, null).map((q) => q.id)).toEqual(["m1", "m2"]);
  });

  it("includes only pathway questions matching the application's pathway", () => {
    const questions = [
      question({ id: "p1", category: "PATHWAY", pathway: "ENTREPRENEURSHIP_ENTERPRISE" }),
      question({ id: "p2", category: "PATHWAY", pathway: "ACADEMIA_ADVANCED_STUDIES" }),
    ];
    expect(selectAutoAskedQuestions(questions, "ENTREPRENEURSHIP_ENTERPRISE").map((q) => q.id)).toEqual(["p1"]);
  });

  it("excludes pathway questions entirely when the application has no matched pathway", () => {
    const questions = [question({ id: "p1", category: "PATHWAY", pathway: "ENTREPRENEURSHIP_ENTERPRISE" })];
    expect(selectAutoAskedQuestions(questions, null)).toEqual([]);
  });

  it("never includes additional-bank questions, even with a matching pathway", () => {
    const questions = [question({ id: "a1", category: "ADDITIONAL_BANK" })];
    expect(selectAutoAskedQuestions(questions, null)).toEqual([]);
  });

  it("excludes inactive questions regardless of category", () => {
    const questions = [question({ id: "m1", category: "MANDATORY", isActive: false })];
    expect(selectAutoAskedQuestions(questions, null)).toEqual([]);
  });

  it("Interview Configuration §8B — picks a random 2 of the matching pathway questions, not every match", () => {
    const questions = [
      question({ id: "p1", category: "PATHWAY", pathway: "ENTREPRENEURSHIP_ENTERPRISE" }),
      question({ id: "p2", category: "PATHWAY", pathway: "ENTREPRENEURSHIP_ENTERPRISE" }),
      question({ id: "p3", category: "PATHWAY", pathway: "ENTREPRENEURSHIP_ENTERPRISE" }),
      question({ id: "p4", category: "PATHWAY", pathway: "ENTREPRENEURSHIP_ENTERPRISE" }),
    ];
    const picked = selectAutoAskedQuestions(questions, "ENTREPRENEURSHIP_ENTERPRISE", seededRandom("interview-1"));
    expect(picked).toHaveLength(2);
    // Every pick is a genuine match, and there are no duplicates.
    expect(new Set(picked.map((q) => q.id)).size).toBe(2);
    for (const q of picked) expect(q.pathway).toBe("ENTREPRENEURSHIP_ENTERPRISE");
  });

  it("Interview Configuration §8C — picks a random 1 situational question, not pathway-filtered", () => {
    const questions = [
      question({ id: "s1", category: "SITUATIONAL", pathway: null }),
      question({ id: "s2", category: "SITUATIONAL", pathway: null }),
      question({ id: "s3", category: "SITUATIONAL", pathway: null }),
    ];
    const picked = selectAutoAskedQuestions(questions, "ENTREPRENEURSHIP_ENTERPRISE", seededRandom("interview-2"));
    expect(picked).toHaveLength(1);
    expect(picked[0].category).toBe("SITUATIONAL");
  });

  it("picks fewer than the target count when the bank doesn't have enough active questions, rather than erroring", () => {
    const questions = [question({ id: "p1", category: "PATHWAY", pathway: "ENTREPRENEURSHIP_ENTERPRISE" })];
    const picked = selectAutoAskedQuestions(questions, "ENTREPRENEURSHIP_ENTERPRISE", seededRandom("interview-3"));
    expect(picked).toEqual([expect.objectContaining({ id: "p1" })]);
  });

  it("combines mandatory (all), a random 2 pathway, and a random 1 situational in one call", () => {
    const questions = [
      question({ id: "m1", category: "MANDATORY" }),
      question({ id: "m2", category: "MANDATORY" }),
      question({ id: "p1", category: "PATHWAY", pathway: "ACADEMIA_ADVANCED_STUDIES" }),
      question({ id: "p2", category: "PATHWAY", pathway: "ACADEMIA_ADVANCED_STUDIES" }),
      question({ id: "p3", category: "PATHWAY", pathway: "ACADEMIA_ADVANCED_STUDIES" }),
      question({ id: "s1", category: "SITUATIONAL" }),
      question({ id: "s2", category: "SITUATIONAL" }),
      question({ id: "a1", category: "ADDITIONAL_BANK" }),
    ];
    const picked = selectAutoAskedQuestions(questions, "ACADEMIA_ADVANCED_STUDIES", seededRandom("interview-4"));
    expect(picked).toHaveLength(5); // 2 mandatory + 2 pathway + 1 situational
    expect(picked.filter((q) => q.category === "MANDATORY")).toHaveLength(2);
    expect(picked.filter((q) => q.category === "PATHWAY")).toHaveLength(2);
    expect(picked.filter((q) => q.category === "SITUATIONAL")).toHaveLength(1);
    expect(picked.some((q) => q.category === "ADDITIONAL_BANK")).toBe(false);
  });
});

describe("seededRandom", () => {
  it("is deterministic — the same seed always produces the same sequence", () => {
    const a = seededRandom("same-interview-id");
    const b = seededRandom("same-interview-id");
    const sequenceA = [a(), a(), a()];
    const sequenceB = [b(), b(), b()];
    expect(sequenceA).toEqual(sequenceB);
  });

  it("different seeds produce different sequences", () => {
    const a = seededRandom("interview-a");
    const b = seededRandom("interview-b");
    expect(a()).not.toBe(b());
  });

  it("always returns a value in [0, 1)", () => {
    const random = seededRandom("bounds-check");
    for (let i = 0; i < 50; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
