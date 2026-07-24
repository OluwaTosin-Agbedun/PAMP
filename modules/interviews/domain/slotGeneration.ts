/**
 * Pure interview-slot generation (Enterprise Functional Specification
 * Addendum §1.3): "generate interview slots only where all assigned
 * panelists are simultaneously available," in fixed
 * `duration + buffer` blocks, respecting a cohort-wide daily capacity.
 * No I/O, no Date.now() — every function here takes its inputs
 * explicitly, so the same inputs always produce the same output (the
 * same determinism principle modules/reviews/domain/scoring.ts
 * establishes for the scoring engine).
 */

export type TimeRange = { start: Date; end: Date };

export type AvailabilityWindow = { type: "AVAILABLE" | "UNAVAILABLE" | "LEAVE"; start: Date; end: Date };

/** Subtracts every UNAVAILABLE/LEAVE window from a set of AVAILABLE windows, for one interviewer. */
export function effectiveAvailability(windows: AvailabilityWindow[]): TimeRange[] {
  const available = windows.filter((w) => w.type === "AVAILABLE").map((w) => ({ start: w.start, end: w.end }));
  const blocked = windows.filter((w) => w.type !== "AVAILABLE").map((w) => ({ start: w.start, end: w.end }));

  let ranges = available;
  for (const block of blocked) {
    ranges = ranges.flatMap((range) => subtractRange(range, block));
  }
  return mergeRanges(ranges);
}

function subtractRange(range: TimeRange, cut: TimeRange): TimeRange[] {
  if (cut.end <= range.start || cut.start >= range.end) return [range];
  const pieces: TimeRange[] = [];
  if (cut.start > range.start) pieces.push({ start: range.start, end: cut.start });
  if (cut.end < range.end) pieces.push({ start: cut.end, end: range.end });
  return pieces;
}

function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = range.end > last.end ? range.end : last.end;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function intersectTwo(a: TimeRange[], b: TimeRange[]): TimeRange[] {
  const result: TimeRange[] = [];
  for (const ra of a) {
    for (const rb of b) {
      const start = ra.start > rb.start ? ra.start : rb.start;
      const end = ra.end < rb.end ? ra.end : rb.end;
      if (start < end) result.push({ start, end });
    }
  }
  return result;
}

/** Every window where *all* of the given panellists' effective availability overlaps simultaneously. */
export function intersectAllPanelists(panelistAvailability: TimeRange[][]): TimeRange[] {
  if (panelistAvailability.length === 0) return [];
  return panelistAvailability.reduce((acc, next) => intersectTwo(acc, next));
}

/** Chops each range into fixed-size blocks (duration + buffer), keeping only fully-fitting blocks. */
export function sliceIntoBlocks(ranges: TimeRange[], durationMinutes: number, bufferMinutes: number): TimeRange[] {
  const blockMs = durationMinutes * 60_000;
  const stepMs = (durationMinutes + bufferMinutes) * 60_000;
  const blocks: TimeRange[] = [];

  for (const range of ranges) {
    let cursor = range.start.getTime();
    const rangeEndMs = range.end.getTime();
    while (cursor + blockMs <= rangeEndMs) {
      blocks.push({ start: new Date(cursor), end: new Date(cursor + blockMs) });
      cursor += stepMs;
    }
  }
  return blocks;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Drops every block that falls on a calendar day already at or over the cohort-wide daily capacity. */
export function excludeFullDays(blocks: TimeRange[], confirmedCountByDate: Map<string, number>, maxPerDay: number): TimeRange[] {
  return blocks.filter((block) => (confirmedCountByDate.get(dateKey(block.start)) ?? 0) < maxPerDay);
}

/**
 * The full pipeline: given every assigned panellist's raw availability
 * rows, the configured duration/buffer/max-per-day, and the cohort's
 * current confirmed-interview counts per day, returns the candidate
 * slots for one interview.
 */
export function generateCandidateSlots(
  panelistWindows: AvailabilityWindow[][],
  opts: { durationMinutes: number; bufferMinutes: number; maxPerDay: number; confirmedCountByDate: Map<string, number> },
): TimeRange[] {
  const perPanelist = panelistWindows.map(effectiveAvailability);
  const intersected = intersectAllPanelists(perPanelist);
  const blocks = sliceIntoBlocks(intersected, opts.durationMinutes, opts.bufferMinutes);
  return excludeFullDays(blocks, opts.confirmedCountByDate, opts.maxPerDay);
}
