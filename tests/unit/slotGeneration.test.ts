import { describe, expect, it } from "vitest";

import {
  effectiveAvailability,
  excludeFullDays,
  generateCandidateSlots,
  intersectAllPanelists,
  sliceIntoBlocks,
  type AvailabilityWindow,
} from "@/modules/interviews/domain/slotGeneration";

function d(iso: string) {
  return new Date(iso);
}

describe("effectiveAvailability", () => {
  it("returns AVAILABLE windows unchanged when nothing overlaps", () => {
    const windows: AvailabilityWindow[] = [{ type: "AVAILABLE", start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T12:00:00Z") }];
    const result = effectiveAvailability(windows);
    expect(result).toEqual([{ start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T12:00:00Z") }]);
  });

  it("subtracts an UNAVAILABLE window from the middle of an AVAILABLE window", () => {
    const windows: AvailabilityWindow[] = [
      { type: "AVAILABLE", start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T12:00:00Z") },
      { type: "UNAVAILABLE", start: d("2026-08-01T10:00:00Z"), end: d("2026-08-01T10:30:00Z") },
    ];
    const result = effectiveAvailability(windows);
    expect(result).toEqual([
      { start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T10:00:00Z") },
      { start: d("2026-08-01T10:30:00Z"), end: d("2026-08-01T12:00:00Z") },
    ]);
  });

  it("a LEAVE window covering the whole range removes it entirely", () => {
    const windows: AvailabilityWindow[] = [
      { type: "AVAILABLE", start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T12:00:00Z") },
      { type: "LEAVE", start: d("2026-08-01T08:00:00Z"), end: d("2026-08-01T13:00:00Z") },
    ];
    expect(effectiveAvailability(windows)).toEqual([]);
  });
});

describe("intersectAllPanelists", () => {
  it("returns the overlap of two panellists' windows", () => {
    const a = [{ start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T11:00:00Z") }];
    const b = [{ start: d("2026-08-01T10:00:00Z"), end: d("2026-08-01T12:00:00Z") }];
    expect(intersectAllPanelists([a, b])).toEqual([{ start: d("2026-08-01T10:00:00Z"), end: d("2026-08-01T11:00:00Z") }]);
  });

  it("returns nothing when panellists have no overlap at all", () => {
    const a = [{ start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T10:00:00Z") }];
    const b = [{ start: d("2026-08-01T11:00:00Z"), end: d("2026-08-01T12:00:00Z") }];
    expect(intersectAllPanelists([a, b])).toEqual([]);
  });

  it("requires all four panellists to overlap simultaneously, not just any pair", () => {
    const a = [{ start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T12:00:00Z") }];
    const b = [{ start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T12:00:00Z") }];
    const c = [{ start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T12:00:00Z") }];
    const d4 = [{ start: d("2026-08-01T11:00:00Z"), end: d("2026-08-01T13:00:00Z") }]; // only free from 11
    expect(intersectAllPanelists([a, b, c, d4])).toEqual([{ start: d("2026-08-01T11:00:00Z"), end: d("2026-08-01T12:00:00Z") }]);
  });
});

describe("sliceIntoBlocks", () => {
  it("produces consecutive 35-minute blocks (30 duration + 5 buffer) that fit fully inside the range", () => {
    const ranges = [{ start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T10:15:00Z") }];
    const blocks = sliceIntoBlocks(ranges, 30, 5);
    // 75 minutes / 35-minute step -> 2 full 30-minute blocks fit (09:00-09:30, 09:35-10:05); a third would need to end by 10:15 but starts at 10:10, ending 10:40 — doesn't fit.
    expect(blocks).toEqual([
      { start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T09:30:00Z") },
      { start: d("2026-08-01T09:35:00Z"), end: d("2026-08-01T10:05:00Z") },
    ]);
  });

  it("produces no blocks when the range is shorter than one duration", () => {
    const ranges = [{ start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T09:15:00Z") }];
    expect(sliceIntoBlocks(ranges, 30, 5)).toEqual([]);
  });
});

describe("excludeFullDays", () => {
  it("drops blocks on a day that has already reached the daily cap", () => {
    const blocks = [
      { start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T09:30:00Z") },
      { start: d("2026-08-02T09:00:00Z"), end: d("2026-08-02T09:30:00Z") },
    ];
    const counts = new Map([["2026-08-01", 4]]);
    const result = excludeFullDays(blocks, counts, 4);
    expect(result).toEqual([{ start: d("2026-08-02T09:00:00Z"), end: d("2026-08-02T09:30:00Z") }]);
  });
});

describe("generateCandidateSlots — full pipeline", () => {
  it("intersects four panellists, slices into blocks, and excludes full days", () => {
    const sharedWindow: AvailabilityWindow = { type: "AVAILABLE", start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T10:10:00Z") };
    const panelistWindows: AvailabilityWindow[][] = [[sharedWindow], [sharedWindow], [sharedWindow], [sharedWindow]];

    const slots = generateCandidateSlots(panelistWindows, {
      durationMinutes: 30,
      bufferMinutes: 5,
      maxPerDay: 4,
      confirmedCountByDate: new Map(),
    });

    expect(slots).toEqual([
      { start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T09:30:00Z") },
      { start: d("2026-08-01T09:35:00Z"), end: d("2026-08-01T10:05:00Z") },
    ]);
  });

  it("returns no slots when the day is already at capacity", () => {
    const sharedWindow: AvailabilityWindow = { type: "AVAILABLE", start: d("2026-08-01T09:00:00Z"), end: d("2026-08-01T10:10:00Z") };
    const panelistWindows: AvailabilityWindow[][] = [[sharedWindow], [sharedWindow], [sharedWindow], [sharedWindow]];

    const slots = generateCandidateSlots(panelistWindows, {
      durationMinutes: 30,
      bufferMinutes: 5,
      maxPerDay: 4,
      confirmedCountByDate: new Map([["2026-08-01", 4]]),
    });

    expect(slots).toEqual([]);
  });
});
