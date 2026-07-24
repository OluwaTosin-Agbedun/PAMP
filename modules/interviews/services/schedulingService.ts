import "server-only";

import { randomBytes, createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { ConflictError, NotFoundError, ReviewConcurrencyError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";
import { getNumericSettingValue, getStringSettingValue } from "@/lib/settings/service";
import { enqueueNotification, type EnqueueNotificationInput } from "@/modules/notifications/services/notificationService";

import { generateCandidateSlots as computeCandidateSlots, type AvailabilityWindow } from "../domain/slotGeneration";
import * as schedulingRepo from "../repositories/schedulingRepository";
import type { SubmitAvailabilityInput } from "../validation/schemas";

/**
 * Interview Scheduling (Enterprise Functional Specification Addendum
 * §1): panel availability, slot generation, applicant token-based
 * booking (ADR-0017), Secretariat confirmation, Teams link entry, and
 * invitation/reminder delivery. Invitations and reminders now enqueue a
 * real notification through Notification Infrastructure
 * (docs/NOTIFICATIONS.md) rather than only recording intent — updated
 * as part of Interview Module Completion (Planning Phase 2). Still no
 * persistent job scheduler exists in this codebase — `sendDueReminders`
 * must be invoked periodically by an external scheduler; see
 * `app/api/cron/process-notifications/route.ts`.
 */

/** Prefers the real Graph-synced Teams meeting over the manual fallback link over the legacy field — same precedence as the panellist's own interview page. */
function resolveJoinLink(interview: { teamsMeeting: { joinUrl: string | null; syncStatus: string } | null; teamsLink: string | null; meetingLink: string | null }): string | null {
  if (interview.teamsMeeting?.syncStatus === "SYNCED" && interview.teamsMeeting.joinUrl) return interview.teamsMeeting.joinUrl;
  return interview.teamsLink ?? interview.meetingLink ?? null;
}

/**
 * A missing template or any other notification-layer failure must never
 * break the actual scheduling action it's attached to (sending an
 * invitation, scanning for due reminders) — mirrors
 * modules/eligibility/screeningService.ts's `notifyApplicant`'s exact
 * defensive shape.
 */
async function notifyApplicantSafely(input: EnqueueNotificationInput): Promise<void> {
  try {
    await enqueueNotification(input);
  } catch (error) {
    logger.error("interviews.notify_applicant_failed", {
      event: input.event,
      relatedEntityId: input.relatedEntityId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function formatInterviewDateTime(scheduledAt: Date): Promise<{ date: string; time: string; timezone: string }> {
  const timeZone = await getStringSettingValue("interview.timezone");
  return {
    date: new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone }).format(scheduledAt),
    time: new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone }).format(scheduledAt),
    timezone: timeZone,
  };
}

const BOOKING_TOKEN_BYTES = 32;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ---------------------------------------------------------------------------
// Panel availability (§1.2)
// ---------------------------------------------------------------------------

export async function submitAvailability(actorId: string, input: SubmitAvailabilityInput) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_AVAILABILITY_MANAGE);

  if (new Date(input.startsAt) >= new Date(input.endsAt)) {
    throw new ValidationError("Availability start time must be before its end time.");
  }
  if (input.type !== "AVAILABLE" && !input.reason?.trim()) {
    throw new ValidationError("A reason is required for unavailability or leave.");
  }

  const row = await schedulingRepo.createAvailability({
    interviewerId: actorId,
    cohortId: input.cohortId,
    type: input.type,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    reason: input.reason ?? null,
  });

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.INTERVIEW_AVAILABILITY_SUBMITTED,
    entityType: "InterviewerAvailability",
    entityId: row.id,
    cohortId: input.cohortId,
    metadata: { type: input.type, startsAt: input.startsAt, endsAt: input.endsAt },
  });

  return row;
}

export async function removeAvailability(actorId: string, availabilityId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_AVAILABILITY_MANAGE);

  const result = await schedulingRepo.deleteAvailability(availabilityId, actorId);
  if (result.count === 0) throw new NotFoundError("That availability entry doesn't exist.");

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.INTERVIEW_AVAILABILITY_UPDATED,
    entityType: "InterviewerAvailability",
    entityId: availabilityId,
    metadata: { action: "removed" },
  });
}

export async function listMyAvailability(actorId: string, cohortId: string) {
  return schedulingRepo.listAvailability(actorId, cohortId);
}

export async function getInterviewSchedulingDetail(actorId: string, interviewId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  return interview;
}

// ---------------------------------------------------------------------------
// Slot generation (§1.3, §1.4)
// ---------------------------------------------------------------------------

/**
 * Generates candidate slots for one interview from its currently-
 * assigned panellists' availability, respecting the configured
 * duration/buffer/daily-capacity. Idempotent — replaces any previously
 * generated OPEN slots (already-SELECTED/CANCELLED ones are historical
 * and untouched).
 */
export async function generateSlotsForInterview(actorId: string, interviewId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.panelists.length === 0) {
    throw new ValidationError("This interview has no assigned panellists yet — assign a panel before generating slots.");
  }

  const [durationMinutes, bufferMinutes, maxPerDay, confirmedCountByDate, availabilityRows] = await Promise.all([
    getNumericSettingValue("interview.duration_minutes"),
    getNumericSettingValue("interview.buffer_minutes"),
    getNumericSettingValue("interview.max_interviews_per_day"),
    schedulingRepo.countConfirmedInterviewsByDate(interview.cohortId),
    schedulingRepo.listAvailabilityForInterviewers(
      interview.panelists.map((p) => p.userId),
      interview.cohortId,
    ),
  ]);

  const panelistWindows: AvailabilityWindow[][] = interview.panelists.map((p) =>
    availabilityRows
      .filter((row) => row.interviewerId === p.userId)
      .map((row) => ({ type: row.type, start: row.startsAt, end: row.endsAt })),
  );

  const slots = computeCandidateSlots(panelistWindows, { durationMinutes, bufferMinutes, maxPerDay, confirmedCountByDate });

  await schedulingRepo.replaceCandidateSlots(interviewId, slots.map((s) => ({ startsAt: s.start, endsAt: s.end })));

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.INTERVIEW_SLOTS_GENERATED,
    entityType: "Interview",
    entityId: interviewId,
    cohortId: interview.cohortId,
    metadata: { candidateCount: slots.length },
  });

  return { candidateCount: slots.length };
}

/**
 * Publishes an interview's candidate slots and (re)generates its
 * booking token. Returns the *raw* token exactly once — it is never
 * persisted (only its SHA-256 hash is), so the Secretariat must copy the
 * booking link now to send to the applicant themselves (there is no
 * automated delivery — see this file's top-of-file comment).
 */
export async function publishSlots(actorId: string, interviewId: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.candidateSlots.filter((s) => s.status === "OPEN").length === 0) {
    throw new ValidationError("Generate candidate slots before publishing.");
  }

  const rawToken = randomBytes(BOOKING_TOKEN_BYTES).toString("base64url");
  const ttlHours = await getNumericSettingValue("interview.booking_token_ttl_hours");
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await schedulingRepo.updateInterviewScheduling(prisma, interviewId, {
    bookingStatus: "SLOTS_PUBLISHED",
    bookingTokenHash: hashToken(rawToken),
    bookingTokenExpiresAt: expiresAt,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_SLOTS_PUBLISHED,
    entityType: "Interview",
    entityId: interviewId,
    cohortId: interview.cohortId,
    metadata: { candidateCount: interview.candidateSlots.length, tokenExpiresAt: expiresAt.toISOString() },
  });

  return { bookingPath: `/interview/book/${rawToken}`, expiresAt };
}

// ---------------------------------------------------------------------------
// Applicant booking — public, token-scoped (§1.5, ADR-0017)
// ---------------------------------------------------------------------------

async function loadInterviewByToken(rawToken: string) {
  const interview = await schedulingRepo.getInterviewByBookingTokenHash(hashToken(rawToken));
  if (!interview) throw new NotFoundError("This booking link is invalid or has expired.");
  if (!interview.bookingTokenExpiresAt || interview.bookingTokenExpiresAt < new Date()) {
    throw new NotFoundError("This booking link is invalid or has expired.");
  }
  return interview;
}

/** Everything the public booking page needs — no data beyond this interview's own slots and applicant name. */
export async function getBookingPageData(rawToken: string) {
  const interview = await loadInterviewByToken(rawToken);
  return {
    applicantName: `${interview.application.applicant.firstName} ${interview.application.applicant.lastName}`,
    durationMinutes: interview.durationMinutes,
    bookingStatus: interview.bookingStatus,
    candidateSlots: interview.candidateSlots,
  };
}

/** "Applicants may never hold multiple interview bookings" — enforced by the bookingStatus-conditioned update below. */
export async function bookSlot(rawToken: string, slotId: string) {
  const interview = await loadInterviewByToken(rawToken);

  if (interview.bookingStatus !== "SLOTS_PUBLISHED") {
    throw new ConflictError("A slot has already been requested for this interview.");
  }

  const slot = interview.candidateSlots.find((s) => s.id === slotId);
  if (!slot || slot.status !== "OPEN") {
    throw new NotFoundError("That slot is no longer available — please choose another.");
  }

  await prisma.$transaction(async (tx) => {
    await schedulingRepo.updateSlotStatus(tx, slot.id, "SELECTED");
    const updated = await schedulingRepo.updateBookingStatus(tx, interview.id, "SLOTS_PUBLISHED", {
      bookingStatus: "PENDING_CONFIRMATION",
      selectedSlotId: slot.id,
    });
    if (updated.count === 0) throw new ReviewConcurrencyError("This interview's booking changed elsewhere — refresh and try again.");
  });

  await writeAuditLog({
    actorId: null,
    action: AUDIT_ACTIONS.INTERVIEW_SLOT_BOOKED,
    entityType: "Interview",
    entityId: interview.id,
    metadata: { applicationId: interview.applicationId, slotId: slot.id, startsAt: slot.startsAt.toISOString() },
  });

  return { confirmed: false as const };
}

// ---------------------------------------------------------------------------
// Secretariat confirmation (§1.6)
// ---------------------------------------------------------------------------

export async function confirmBooking(actorId: string, interviewId: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.bookingStatus !== "PENDING_CONFIRMATION" || !interview.selectedSlot) {
    throw new ConflictError("This interview has no pending booking to confirm.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await schedulingRepo.updateSlotStatus(tx, interview.selectedSlot!.id, "SELECTED");
    const updated = await schedulingRepo.updateBookingStatus(tx, interviewId, "PENDING_CONFIRMATION", {
      bookingStatus: "CONFIRMED",
      scheduledAt: interview.selectedSlot!.startsAt,
      confirmedAt: now,
      confirmedById: actor.id,
    });
    if (updated.count === 0) throw new ReviewConcurrencyError();
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_BOOKING_CONFIRMED,
    entityType: "Interview",
    entityId: interviewId,
    cohortId: interview.cohortId,
    metadata: { scheduledAt: interview.selectedSlot.startsAt.toISOString() },
  });
}

async function resetBooking(actorId: string, interviewId: string, reason: string, action: "DECLINED" | "RESELECTION_REQUESTED") {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);
  if (!reason.trim()) throw new ValidationError("A reason is required.");

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.bookingStatus !== "PENDING_CONFIRMATION" || !interview.selectedSlot) {
    throw new ConflictError("This interview has no pending booking to act on.");
  }

  await prisma.$transaction(async (tx) => {
    await schedulingRepo.updateSlotStatus(tx, interview.selectedSlot!.id, "CANCELLED");
    const updated = await schedulingRepo.updateBookingStatus(tx, interviewId, "PENDING_CONFIRMATION", {
      bookingStatus: "SLOTS_PUBLISHED",
      selectedSlotId: null,
      declinedAt: new Date(),
      declinedById: actor.id,
      declineReason: reason,
    });
    if (updated.count === 0) throw new ReviewConcurrencyError();
  });

  await writeAuditLog({
    actorId: actor.id,
    action: action === "DECLINED" ? AUDIT_ACTIONS.INTERVIEW_BOOKING_DECLINED : AUDIT_ACTIONS.INTERVIEW_RESELECTION_REQUESTED,
    entityType: "Interview",
    entityId: interviewId,
    cohortId: interview.cohortId,
    metadata: { reason, previousSlotId: interview.selectedSlot.id },
  });
}

export async function declineBooking(actorId: string, interviewId: string, reason: string) {
  return resetBooking(actorId, interviewId, reason, "DECLINED");
}

export async function requestAnotherSlot(actorId: string, interviewId: string, reason: string) {
  return resetBooking(actorId, interviewId, reason, "RESELECTION_REQUESTED");
}

// ---------------------------------------------------------------------------
// Teams link (§1.7)
// ---------------------------------------------------------------------------

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function setTeamsLink(actorId: string, interviewId: string, link: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);

  if (!isValidHttpUrl(link)) {
    throw new ValidationError("That doesn't look like a valid meeting link.");
  }

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.bookingStatus !== "CONFIRMED") {
    throw new ConflictError("The interview must be confirmed before a meeting link can be added.");
  }

  await schedulingRepo.updateInterviewScheduling(prisma, interviewId, {
    teamsLink: link,
    teamsLinkAddedAt: new Date(),
    teamsLinkAddedById: actor.id,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_TEAMS_LINK_ADDED,
    entityType: "Interview",
    entityId: interviewId,
    cohortId: interview.cohortId,
  });
}

/**
 * PAM-P 2026 Interview Score Sheet — Virtual/Physical/Hybrid, an
 * interview-level fact settable the same way the Teams link is (same
 * permission, no CONFIRMED-status gate since mode is just descriptive,
 * not something the applicant-facing booking flow depends on).
 */
export async function setInterviewMode(actorId: string, interviewId: string, mode: "VIRTUAL" | "PHYSICAL" | "HYBRID") {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");

  await schedulingRepo.updateInterviewScheduling(prisma, interviewId, { mode });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_MODE_SET,
    entityType: "Interview",
    entityId: interviewId,
    cohortId: interview.cohortId,
    metadata: { mode },
  });
}

// ---------------------------------------------------------------------------
// Invitations (§1.8) and reminders (§1.9)
// ---------------------------------------------------------------------------

/**
 * "Mandatory before invitations can be sent" (§1.7). Enqueues a real
 * INTERVIEW_INVITATION notification to the applicant through
 * Notification Infrastructure — panellists already see their assignment
 * via the pre-existing in-app `Notification` (bell icon), so this
 * doesn't duplicate that with a second email.
 */
export async function sendInvitations(actorId: string, interviewId: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.bookingStatus !== "CONFIRMED") throw new ConflictError("This interview isn't confirmed yet.");
  if (!interview.teamsLink && interview.teamsMeeting?.syncStatus !== "SYNCED") {
    throw new ValidationError("Add or sync a Teams meeting link before sending invitations.");
  }

  await schedulingRepo.updateInterviewScheduling(prisma, interviewId, { invitationsSentAt: new Date() });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_INVITATIONS_SENT,
    entityType: "Interview",
    entityId: interviewId,
    cohortId: interview.cohortId,
    metadata: {
      recipients: [
        interview.application.applicant.email,
        ...interview.panelists.map((p) => p.user.email),
      ],
    },
  });

  const { date, time, timezone } = await formatInterviewDateTime(interview.scheduledAt!);
  await notifyApplicantSafely({
    event: "INTERVIEW_INVITATION",
    recipient: { type: "APPLICANT", applicantId: interview.application.applicantId, email: interview.application.applicant.email },
    variables: {
      applicantFirstName: interview.application.applicant.firstName,
      interviewDate: date,
      interviewStartTime: time,
      interviewTimezone: timezone,
      joinLink: resolveJoinLink(interview) ?? "To be confirmed",
    },
    relatedEntityType: "Interview",
    relatedEntityId: interviewId,
    createdById: actor.id,
  });
}

/**
 * Scans confirmed, invited interviews and enqueues an INTERVIEW_REMINDER
 * notification for any threshold (Interview Configuration §4 — 72h/24h/
 * 1h by default, `interview.reminder_hours_before`) that has just been
 * crossed. `AUDIT_ACTIONS.INTERVIEW_REMINDER_SENT`'s own existing audit
 * row (one per interview × threshold) is still what prevents a
 * duplicate reminder across repeated calls — `enqueueNotification`'s own
 * dedup is a second, independent backstop, not the only one.
 *
 * Nothing in this codebase runs a persistent job scheduler — this must
 * be invoked periodically by an external scheduler; see
 * `app/api/cron/process-notifications/route.ts`, which calls this
 * before draining the outbox.
 */
export async function sendDueReminders(now: Date = new Date()) {
  const intervalsRaw = await getStringSettingValue("interview.reminder_hours_before");
  const thresholds = intervalsRaw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const upcoming = await prisma.interview.findMany({
    where: { bookingStatus: "CONFIRMED", invitationsSentAt: { not: null }, scheduledAt: { gt: now } },
    include: {
      application: { include: { applicant: true } },
      panelists: { where: { status: "ASSIGNED" }, select: { userId: true } },
      teamsMeeting: { select: { joinUrl: true, syncStatus: true } },
    },
  });

  let sent = 0;
  for (const interview of upcoming) {
    const hoursUntil = (interview.scheduledAt!.getTime() - now.getTime()) / (60 * 60 * 1000);
    for (const threshold of thresholds) {
      if (hoursUntil > threshold) continue;

      const alreadySent = await prisma.auditLog.findFirst({
        where: {
          action: AUDIT_ACTIONS.INTERVIEW_REMINDER_SENT,
          entityId: interview.id,
          metadata: { path: ["thresholdHours"], equals: threshold },
        },
      });
      if (alreadySent) continue;

      await writeAuditLog({
        actorId: null,
        action: AUDIT_ACTIONS.INTERVIEW_REMINDER_SENT,
        entityType: "Interview",
        entityId: interview.id,
        cohortId: interview.cohortId,
        metadata: {
          thresholdHours: threshold,
          recipients: [interview.application.applicant.email, ...interview.panelists.map((p) => p.userId)],
        },
      });

      const { date, time, timezone } = await formatInterviewDateTime(interview.scheduledAt!);
      await notifyApplicantSafely({
        event: "INTERVIEW_REMINDER",
        recipient: { type: "APPLICANT", applicantId: interview.application.applicantId, email: interview.application.applicant.email },
        variables: {
          applicantFirstName: interview.application.applicant.firstName,
          interviewDate: date,
          interviewStartTime: time,
          interviewTimezone: timezone,
          joinLink: resolveJoinLink(interview) ?? "To be confirmed",
          hoursBefore: String(threshold),
        },
        relatedEntityType: "Interview",
        relatedEntityId: `${interview.id}:reminder:${threshold}`,
        createdById: null,
      });
      sent += 1;
    }
  }
  return { remindersSent: sent };
}

/**
 * Interview Configuration §6/§4.6 — attendance is recorded manually by
 * the Programme Secretariat; no automatic Teams attendance retrieval is
 * assumed by this integration (see docs/TEAMS_INTEGRATION.md). Reusing
 * `INTERVIEW_SCHEDULING_MANAGE` rather than a new permission — this is
 * the same Secretariat operator role that already manages every other
 * scheduling fact on this interview.
 */
export async function recordAttendance(
  actorId: string,
  interviewId: string,
  status: "PRESENT" | "LATE" | "ABSENT" | "TECHNICAL_ISSUE" | "RESCHEDULED" | "CANCELLED",
  note?: string,
) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");

  await schedulingRepo.updateInterviewScheduling(prisma, interviewId, {
    attendanceStatus: status,
    attendanceRecordedAt: new Date(),
    attendanceRecordedById: actor.id,
    attendanceNote: note ?? null,
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_ATTENDANCE_RECORDED,
    entityType: "Interview",
    entityId: interviewId,
    cohortId: interview.cohortId,
    metadata: { status, note: note ?? null },
  });
}
