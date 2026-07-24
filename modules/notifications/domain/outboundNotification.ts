import type { OutboundNotificationStatus } from "@/lib/generated/prisma/client";

/**
 * Pure status-transition guard — no I/O. `PENDING`/`SCHEDULED` are the
 * only states a cancel is allowed from (§5.5: "Cancel pending
 * notifications" — a `PROCESSING` or already-`SENT` row can't be
 * un-sent). `FAILED` is the only state a retry is allowed from (a
 * `SENT` row has nothing to retry; a `CANCELLED` row was deliberately
 * stopped, not failed).
 */

const CANCELLABLE_STATUSES: OutboundNotificationStatus[] = ["PENDING", "SCHEDULED"];
const RETRYABLE_STATUSES: OutboundNotificationStatus[] = ["FAILED"];

export function canCancel(status: OutboundNotificationStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}

export function canRetry(status: OutboundNotificationStatus): boolean {
  return RETRYABLE_STATUSES.includes(status);
}

/** A row is "due" for the processor to attempt if it's `PENDING` (an
 *  immediate send, never scheduled) or `SCHEDULED`/`RETRYING` with
 *  `scheduledFor` at or before `asOf`. */
export function isDue(
  row: { status: OutboundNotificationStatus; scheduledFor: Date | null },
  asOf: Date,
): boolean {
  if (row.status === "PENDING") return true;
  if (row.status === "SCHEDULED" || row.status === "RETRYING") {
    return row.scheduledFor !== null && row.scheduledFor <= asOf;
  }
  return false;
}
