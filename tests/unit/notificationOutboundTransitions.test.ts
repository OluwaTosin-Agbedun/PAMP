import { describe, expect, it } from "vitest";

import { canCancel, canRetry, isDue } from "@/modules/notifications/domain/outboundNotification";

describe("canCancel", () => {
  it("allows cancelling from Pending or Scheduled", () => {
    expect(canCancel("PENDING")).toBe(true);
    expect(canCancel("SCHEDULED")).toBe(true);
  });

  it("never allows cancelling a Processing, Sent, Failed, Retrying, or already-Cancelled row", () => {
    for (const status of ["PROCESSING", "SENT", "FAILED", "RETRYING", "CANCELLED"] as const) {
      expect(canCancel(status)).toBe(false);
    }
  });
});

describe("canRetry", () => {
  it("only allows retrying from Failed", () => {
    expect(canRetry("FAILED")).toBe(true);
  });

  it("never allows retrying a Sent, Cancelled, Pending, Scheduled, Processing, or already-Retrying row", () => {
    for (const status of ["SENT", "CANCELLED", "PENDING", "SCHEDULED", "PROCESSING", "RETRYING"] as const) {
      expect(canRetry(status)).toBe(false);
    }
  });
});

describe("isDue", () => {
  const now = new Date("2026-08-01T12:00:00Z");

  it("a Pending row is always due, regardless of scheduledFor", () => {
    expect(isDue({ status: "PENDING", scheduledFor: null }, now)).toBe(true);
  });

  it("a Scheduled row is due once its time has passed", () => {
    expect(isDue({ status: "SCHEDULED", scheduledFor: new Date("2026-08-01T11:00:00Z") }, now)).toBe(true);
    expect(isDue({ status: "SCHEDULED", scheduledFor: new Date("2026-08-01T13:00:00Z") }, now)).toBe(false);
  });

  it("a Retrying row follows the same due logic as Scheduled", () => {
    expect(isDue({ status: "RETRYING", scheduledFor: new Date("2026-08-01T11:00:00Z") }, now)).toBe(true);
  });

  it("Sent, Failed, Processing, and Cancelled rows are never due", () => {
    for (const status of ["SENT", "FAILED", "PROCESSING", "CANCELLED"] as const) {
      expect(isDue({ status, scheduledFor: null }, now)).toBe(false);
    }
  });
});
