"use server";

import { revalidatePath } from "next/cache";

import { handleActionError } from "@/lib/errors/handleAction";
import { requireSession } from "@/lib/permissions/guard";
import {
  confirmBooking,
  declineBooking,
  generateSlotsForInterview,
  publishSlots,
  recordAttendance,
  requestAnotherSlot,
  sendInvitations,
  setInterviewMode,
  setTeamsLink,
} from "@/modules/interviews/services/schedulingService";
import {
  cancelInterview,
  createOrSyncTeamsMeeting,
  rescheduleInterview,
  retryTeamsMeetingSync,
} from "@/modules/interviews/services/teamsMeetingService";
import {
  cancelInterviewSchema,
  createTeamsMeetingSchema,
  declineBookingSchema,
  recordAttendanceSchema,
  requestAnotherSlotSchema,
  rescheduleInterviewSchema,
  retryTeamsMeetingSyncSchema,
  setInterviewModeSchema,
  setTeamsLinkSchema,
} from "@/modules/interviews/validation/schemas";

export type SchedulingActionResult = { success: true; bookingPath?: string; expiresAt?: string } | { error: string };

function revalidate(interviewId: string) {
  revalidatePath(`/interviews/scheduling/${interviewId}`);
  revalidatePath("/interviews/scheduling");
}

export async function generateSlotsAction(interviewId: string): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    await generateSlotsForInterview(session.user.id, interviewId);
    revalidate(interviewId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.generateSlots");
  }
}

export async function publishSlotsAction(interviewId: string): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    const result = await publishSlots(session.user.id, interviewId);
    revalidate(interviewId);
    return { success: true, bookingPath: result.bookingPath, expiresAt: result.expiresAt.toISOString() };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.publish");
  }
}

export async function confirmBookingAction(interviewId: string): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    await confirmBooking(session.user.id, interviewId);
    revalidate(interviewId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.confirm");
  }
}

export async function declineBookingAction(input: unknown): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    const parsed = declineBookingSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await declineBooking(session.user.id, parsed.data.interviewId, parsed.data.reason);
    revalidate(parsed.data.interviewId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.decline");
  }
}

export async function requestAnotherSlotAction(input: unknown): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    const parsed = requestAnotherSlotSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await requestAnotherSlot(session.user.id, parsed.data.interviewId, parsed.data.reason);
    revalidate(parsed.data.interviewId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.requestAnotherSlot");
  }
}

export async function setTeamsLinkAction(input: unknown): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    const parsed = setTeamsLinkSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await setTeamsLink(session.user.id, parsed.data.interviewId, parsed.data.link);
    revalidate(parsed.data.interviewId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.setTeamsLink");
  }
}

export async function setInterviewModeAction(input: unknown): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    const parsed = setInterviewModeSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await setInterviewMode(session.user.id, parsed.data.interviewId, parsed.data.mode);
    revalidate(parsed.data.interviewId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.setMode");
  }
}

export async function sendInvitationsAction(interviewId: string): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    await sendInvitations(session.user.id, interviewId);
    revalidate(interviewId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.sendInvitations");
  }
}

export async function recordAttendanceAction(input: unknown): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    const parsed = recordAttendanceSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await recordAttendance(session.user.id, parsed.data.interviewId, parsed.data.status, parsed.data.note);
    revalidate(parsed.data.interviewId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.recordAttendance");
  }
}

// ---------------------------------------------------------------------------
// Microsoft Teams Interview Integration
// ---------------------------------------------------------------------------

export async function createTeamsMeetingAction(input: unknown): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    const parsed = createTeamsMeetingSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await createOrSyncTeamsMeeting(session.user.id, parsed.data.interviewId);
    revalidate(parsed.data.interviewId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.createTeamsMeeting");
  }
}

export async function retryTeamsMeetingSyncAction(input: unknown): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    const parsed = retryTeamsMeetingSyncSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await retryTeamsMeetingSync(session.user.id, parsed.data.interviewId);
    revalidate(parsed.data.interviewId);
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.retryTeamsMeetingSync");
  }
}

export async function rescheduleInterviewAction(input: unknown): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    const parsed = rescheduleInterviewSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const result = await rescheduleInterview(session.user.id, parsed.data.interviewId, new Date(parsed.data.scheduledAt), parsed.data.reason);
    revalidate(parsed.data.interviewId);
    if (result.teamsSynced === false) {
      return { error: `Interview rescheduled, but the Teams meeting couldn't be updated: ${result.teamsSyncError}` };
    }
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.reschedule");
  }
}

export async function cancelInterviewAction(input: unknown): Promise<SchedulingActionResult> {
  const session = await requireSession();
  try {
    const parsed = cancelInterviewSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const result = await cancelInterview(session.user.id, parsed.data.interviewId, parsed.data.reason);
    revalidate(parsed.data.interviewId);
    if (result.teamsMeetingCancelled === false) {
      return { error: `Interview cancelled, but the Teams meeting couldn't be cancelled automatically: ${result.teamsCancelError}` };
    }
    return { success: true };
  } catch (error) {
    return handleActionError(error, "interviews.scheduling.cancel");
  }
}
