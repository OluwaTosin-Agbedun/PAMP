import { describe, expect, it } from "vitest";

import { dateRangeDays, percentage, statesInZone, toCountRecord, zoneForState } from "@/modules/analytics/domain/analytics";

describe("zoneForState", () => {
  it("maps a known Nigerian state to its geopolitical zone", () => {
    expect(zoneForState("Lagos")).toBe("South West");
    expect(zoneForState("Kano")).toBe("North West");
    expect(zoneForState("Rivers")).toBe("South South");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(zoneForState("  lagos  ")).toBe("South West");
    expect(zoneForState("LAGOS")).toBe("South West");
  });

  it("returns null for null, undefined, or an unrecognised value — never throws", () => {
    expect(zoneForState(null)).toBeNull();
    expect(zoneForState(undefined)).toBeNull();
    expect(zoneForState("Not a real state")).toBeNull();
  });
});

describe("statesInZone", () => {
  it("returns every state belonging to a zone, the exact inverse of zoneForState", () => {
    const southWestStates = statesInZone("South West");
    expect(southWestStates).toContain("Lagos");
    expect(southWestStates).toContain("Oyo");
    for (const state of southWestStates) {
      expect(zoneForState(state)).toBe("South West");
    }
  });

  it("is case-insensitive on the zone name itself", () => {
    expect(statesInZone("south west")).toEqual(statesInZone("South West"));
  });

  it("returns an empty array for an unrecognised zone", () => {
    expect(statesInZone("Not a real zone")).toEqual([]);
  });
});

describe("toCountRecord", () => {
  it("folds groupBy-shaped rows into a plain count record", () => {
    const record = toCountRecord([
      { key: "ELIGIBLE", count: 5 },
      { key: "PENDING", count: 3 },
    ]);
    expect(record).toEqual({ ELIGIBLE: 5, PENDING: 3 });
  });

  it("buckets a null key under the null label instead of dropping it", () => {
    const record = toCountRecord([{ key: null, count: 4 }], "Not recorded");
    expect(record).toEqual({ "Not recorded": 4 });
  });

  it("merges multiple rows that fold to the same label", () => {
    const record = toCountRecord([
      { key: null, count: 2 },
      { key: null, count: 3 },
    ]);
    expect(record["Not recorded"]).toBe(5);
  });
});

describe("percentage", () => {
  it("rounds to one decimal place", () => {
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(2, 3)).toBe(66.7);
  });

  it("returns 0 for a zero denominator rather than dividing by zero", () => {
    expect(percentage(5, 0)).toBe(0);
  });

  it("returns 100 for numerator equal to denominator", () => {
    expect(percentage(10, 10)).toBe(100);
  });
});

describe("dateRangeDays", () => {
  it("includes both endpoints and every day between them", () => {
    const days = dateRangeDays(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-03T00:00:00Z"));
    expect(days).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("returns a single day when from and to are the same date", () => {
    const days = dateRangeDays(new Date("2026-01-01T12:00:00Z"), new Date("2026-01-01T23:00:00Z"));
    expect(days).toEqual(["2026-01-01"]);
  });
});
