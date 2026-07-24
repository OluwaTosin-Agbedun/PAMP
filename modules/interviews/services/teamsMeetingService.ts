import "server-only";

import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { ConflictError, GraphNotConfiguredError, NotFoundError, ValidationError } from "@/lib/errors";
import { getGraphClient, getGraphOrganiserUpn, type TeamsMeetingRequest } from "@/lib/msgraph/client";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";
import { getStringSettingValue } from "@/lib/settings/service";

import * as schedulingRepo from "../repositories/schedulingRepository";
import * as teamsRepo from "../repositories/teamsMeetingRepository";

/**
 * Microsoft Teams Interview Integration. Creates/updates a real Graph-
 * backed online meeting for a confirmed interview, distinct from
 * `Interview.teamsLink` (the pre-existing manual fallback — see
 * `schedulingService.ts#setTeamsLink`). One `InterviewTeamsMeeting` row
 * per interview; reschedule/cancel always act on that same row's
 * `graphEventId` (PATCH/cancel), never creating a second meeting. A
 * failed sync is always persisted as `FAILED` and always re-thrown to
 * the caller — this module never reports success it didn't actually
 * achieve. See docs/TEAMS_INTEGRATION.md.
 */

type LoadedInterview = NonNullable<Awaited<ReturnType<typeof schedulingRepo.getInterviewForScheduling>>>;

async function loadConfirmedInterview(interviewId: string): Promise<LoadedInterview> {
  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.status === "CANCELLED") throw new ConflictError("This interview has been cancelled.");
  if (interview.bookingStatus !== "CONFIRMED" || !interview.scheduledAt) {
    throw new ConflictError("The interview must be confirmed, with a scheduled time, before a Teams meeting can be created.");
  }
  return interview;
}

async function buildMeetingRequest(interview: LoadedInterview): Promise<TeamsMeetingRequest> {
  const timeZone = await getStringSettingValue("interview.timezone");
  const start = interview.scheduledAt!;
  const end = new Date(start.getTime() + interview.durationMinutes * 60 * 1000);

  return {
    subject: `PAM-P Interview — ${interview.application.applicant.firstName} ${interview.application.applicant.lastName}`,
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    timeZone,
    attendeeEmails: [
      interview.application.applicant.email,
      ...interview.panelists.map((p) => p.user.email),
    ].filter((email): email is string => Boolean(email)),
  };
}

/** Shared by createOrSyncTeamsMeeting and retryTeamsMeetingSync — both
 *  attempt the same create-or-update-on-Graph operation; only the
 *  permission gate and the audit action recorded differ. */
async function attemptSync(actorId: string, interviewId: string, auditActionOnSuccessCreate: AuditAction, auditActionOnSuccessUpdate: AuditAction) {
  const interview = await loadConfirmedInterview(interviewId);

  const meetingRow = await teamsRepo.ensureMeetingRow(interviewId, actorId);
  await teamsRepo.recordAttempt(meetingRow.id);

  const client = getGraphClient();
  if (!client) {
    await teamsRepo.recordFailure(meetingRow.id, "Microsoft Teams integration isn't configured in this environment.");
    await writeAuditLog({
      actorId,
      action: AUDIT_ACTIONS.INTERVIEW_TEAMS_SYNC_FAILED,
      entityType: "Interview",
      entityId: interviewId,
      cohortId: interview.cohortId,
      metadata: { reason: "not_configured" },
    });
    throw new GraphNotConfiguredError();
  }

  const request = await buildMeetingRequest(interview);
  const wasAlreadySynced = Boolean(meetingRow.graphEventId);

  try {
    const result = wasAlreadySynced
      ? await client.updateMeeting(meetingRow.graphEventId!, request)
      : await client.createMeeting(request);

    await teamsRepo.recordSuccess(meetingRow.id, {
      graphEventId: result.graphEventId,
      joinUrl: result.joinUrl,
      organiserUpn: getGraphOrganiserUpn(),
    });

    await writeAuditLog({
      actorId,
      action: wasAlreadySynced ? auditActionOnSuccessUpdate : auditActionOnSuccessCreate,
      entityType: "Interview",
      entityId: interviewId,
      cohortId: interview.cohortId,
      metadata: { graphEventId: result.graphEventId },
    });

    await notifyPanelAndOrganiser(interview, wasAlreadySynced ? "updated" : "created");

    return teamsRepo.getByInterviewId(interviewId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Microsoft Graph error.";
    await teamsRepo.recordFailure(meetingRow.id, message);
    await writeAuditLog({
      actorId,
      action: AUDIT_ACTIONS.INTERVIEW_TEAMS_SYNC_FAILED,
      entityType: "Interview",
      entityId: interviewId,
      cohortId: interview.cohortId,
      metadata: { reason: message },
    });
    throw err;
  }
}

async function notifyPanelAndOrganiser(interview: LoadedInterview, kind: "created" | "updated") {
  const title =
    kind === "created" ? "A Teams meeting was created for your interview" : "Your interview's Teams meeting was updated";
  await prisma.notification.createMany({
    data: interview.panelists.map((p) => ({
      userId: p.user.id,
      type: kind === "created" ? "INTERVIEW_TEAMS_MEETING_CREATED" : "INTERVIEW_TEAMS_MEETING_UPDATED",
      title,
      entityType: "Interview",
      entityId: interview.id,
    })),
  });
}

/** Read-only lookup for the scheduling detail page — gated the same as viewing the interview at all. */
export async function getTeamsMeetingForInterview(actorId: string, interviewId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_TEAMS_LINK_VIEW);
  return teamsRepo.getByInterviewId(interviewId);
}

/** §"Create Teams meeting" — the primary create/re-sync action. */
export async function createOrSyncTeamsMeeting(actorId: string, interviewId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_TEAMS_MEETING_CREATE);
  return attemptSync(actorId, interviewId, AUDIT_ACTIONS.INTERVIEW_TEAMS_MEETING_CREATED, AUDIT_ACTIONS.INTERVIEW_TEAMS_MEETING_UPDATED);
}

/** §"Retry sync" — same operation, its own permission and audit trail so a retry is distinguishable from the original attempt. */
export async function retryTeamsMeetingSync(actorId: string, interviewId: string) {
  await requirePermission(actorId, PERMISSIONS.INTERVIEW_TEAMS_SYNC_RETRY);

  const existing = await teamsRepo.getByInterviewId(interviewId);
  if (!existing || existing.syncStatus !== "FAILED") {
    throw new ValidationError("There's no failed Teams sync to retry for this interview.");
  }

  const result = await attemptSync(
    actorId,
    interviewId,
    AUDIT_ACTIONS.INTERVIEW_TEAMS_MEETING_CREATED,
    AUDIT_ACTIONS.INTERVIEW_TEAMS_MEETING_UPDATED,
  );

  await writeAuditLog({
    actorId,
    action: AUDIT_ACTIONS.INTERVIEW_TEAMS_SYNC_RETRIED,
    entityType: "Interview",
    entityId: interviewId,
    metadata: { previousFailureReason: existing.failureReason },
  });

  return result;
}

/**
 * §"Reschedule" — changes `Interview.scheduledAt` and, if a Teams
 * meeting already exists (synced or previously failed), re-attempts the
 * sync so the same Graph event moves with it. The interview's new time
 * is saved even if the Graph re-sync fails — `teamsSynced: false` in
 * the return value is how the caller (and the UI) is told the meeting
 * itself still needs attention, never silently.
 */
export async function rescheduleInterview(actorId: string, interviewId: string, newScheduledAt: Date, reason: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);

  if (!reason.trim()) throw new ValidationError("A reason is required to reschedule an interview.");

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.status === "CANCELLED") throw new ConflictError("This interview has been cancelled.");
  if (interview.bookingStatus !== "CONFIRMED") throw new ConflictError("Only a confirmed interview can be rescheduled.");
  if (Number.isNaN(newScheduledAt.getTime())) throw new ValidationError("That isn't a valid date/time.");

  const previousScheduledAt = interview.scheduledAt;

  await prisma.$transaction(async (tx) => {
    await teamsRepo.rescheduleInterview(tx, interviewId, newScheduledAt);
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_RESCHEDULED,
    entityType: "Interview",
    entityId: interviewId,
    cohortId: interview.cohortId,
    metadata: { reason, previousScheduledAt: previousScheduledAt?.toISOString() ?? null, newScheduledAt: newScheduledAt.toISOString() },
  });

  const existingMeeting = await teamsRepo.getByInterviewId(interviewId);
  if (!existingMeeting) {
    return { rescheduled: true as const, teamsSynced: null };
  }

  try {
    await attemptSync(actor.id, interviewId, AUDIT_ACTIONS.INTERVIEW_TEAMS_MEETING_CREATED, AUDIT_ACTIONS.INTERVIEW_TEAMS_MEETING_UPDATED);
    return { rescheduled: true as const, teamsSynced: true as const };
  } catch (err) {
    return { rescheduled: true as const, teamsSynced: false as const, teamsSyncError: err instanceof Error ? err.message : "Unknown error." };
  }
}

/**
 * §"Cancel" — ends the interview outright (`status: CANCELLED`),
 * distinct from `declineBooking`/`requestAnotherSlot`, which only ever
 * reset a *pending* applicant booking. Cancels any synced Teams meeting
 * too. The interview cancellation always succeeds once permitted and
 * valid; a failure to cancel the Graph meeting is reported back
 * (`teamsMeetingCancelled: false`), never hidden — the interview being
 * cancelled in the FMS is not the same fact as the Teams meeting being
 * gone from the organiser's calendar, and the two must not be conflated.
 */
export async function cancelInterview(actorId: string, interviewId: string, reason: string) {
  const actor = await requirePermission(actorId, PERMISSIONS.INTERVIEW_CANCEL);

  if (!reason.trim()) throw new ValidationError("A reason is required to cancel an interview.");

  const interview = await schedulingRepo.getInterviewForScheduling(interviewId);
  if (!interview) throw new NotFoundError("That interview doesn't exist.");
  if (interview.status === "CANCELLED") throw new ConflictError("This interview is already cancelled.");

  const meeting = await teamsRepo.getByInterviewId(interviewId);

  let teamsMeetingCancelled: boolean | null = null;
  let teamsCancelError: string | undefined;

  if (meeting?.graphEventId && meeting.syncStatus === "SYNCED") {
    const client = getGraphClient();
    if (!client) {
      teamsMeetingCancelled = false;
      teamsCancelError = "Microsoft Teams integration isn't configured in this environment — cancel the meeting manually.";
    } else {
      try {
        await client.cancelMeeting(meeting.graphEventId);
        await teamsRepo.recordCancellation(meeting.id, actor.id);
        await writeAuditLog({
          actorId: actor.id,
          action: AUDIT_ACTIONS.INTERVIEW_TEAMS_MEETING_CANCELLED,
          entityType: "Interview",
          entityId: interviewId,
          cohortId: interview.cohortId,
        });
        teamsMeetingCancelled = true;
      } catch (err) {
        teamsMeetingCancelled = false;
        teamsCancelError = err instanceof Error ? err.message : "Unknown Microsoft Graph error.";
        await writeAuditLog({
          actorId: actor.id,
          action: AUDIT_ACTIONS.INTERVIEW_TEAMS_SYNC_FAILED,
          entityType: "Interview",
          entityId: interviewId,
          cohortId: interview.cohortId,
          metadata: { reason: teamsCancelError, context: "cancel" },
        });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await teamsRepo.cancelInterview(tx, interviewId, { cancelledById: actor.id, cancellationReason: reason });
  });

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.INTERVIEW_CANCELLED,
    entityType: "Interview",
    entityId: interviewId,
    cohortId: interview.cohortId,
    metadata: { reason },
  });

  await prisma.notification.createMany({
    data: interview.panelists.map((p) => ({
      userId: p.user.id,
      type: "INTERVIEW_CANCELLED",
      title: "An interview you were assigned to has been cancelled",
      body: reason,
      entityType: "Interview",
      entityId: interview.id,
    })),
  });

  return { cancelled: true as const, teamsMeetingCancelled, teamsCancelError };
}
