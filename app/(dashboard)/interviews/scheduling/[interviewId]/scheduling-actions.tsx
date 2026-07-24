"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  cancelInterviewAction,
  confirmBookingAction,
  createTeamsMeetingAction,
  declineBookingAction,
  generateSlotsAction,
  publishSlotsAction,
  recordAttendanceAction,
  requestAnotherSlotAction,
  rescheduleInterviewAction,
  retryTeamsMeetingSyncAction,
  sendInvitationsAction,
  setInterviewModeAction,
  setTeamsLinkAction,
} from "./actions";

type BookingStatus = "AWAITING_SLOTS" | "SLOTS_PUBLISHED" | "PENDING_CONFIRMATION" | "CONFIRMED" | "DECLINED";
type InterviewStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
type InterviewMode = "VIRTUAL" | "PHYSICAL" | "HYBRID";
type TeamsSyncStatus = "PENDING" | "SYNCED" | "FAILED" | "CANCELLED";
type TeamsMeetingInfo = { syncStatus: TeamsSyncStatus; joinUrl: string | null; failureReason: string | null } | null;
type AttendanceStatus = "SCHEDULED" | "PRESENT" | "LATE" | "ABSENT" | "TECHNICAL_ISSUE" | "RESCHEDULED" | "CANCELLED";

const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
  { value: "TECHNICAL_ISSUE", label: "Technical Issue" },
  { value: "RESCHEDULED", label: "Rescheduled" },
  { value: "CANCELLED", label: "Cancelled" },
];

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  SCHEDULED: "Not yet recorded",
  PRESENT: "Present",
  LATE: "Late",
  ABSENT: "Absent",
  TECHNICAL_ISSUE: "Technical Issue",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
};

const SYNC_STATUS_LABEL: Record<TeamsSyncStatus, string> = {
  PENDING: "Not yet synced",
  SYNCED: "Synced with Microsoft Teams",
  FAILED: "Sync failed",
  CANCELLED: "Meeting cancelled",
};

/** `datetime-local` inputs need "YYYY-MM-DDTHH:mm" in the browser's local time, not an ISO string. */
function toDatetimeLocalValue(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MODE_OPTIONS: { value: InterviewMode; label: string }[] = [
  { value: "VIRTUAL", label: "Virtual" },
  { value: "PHYSICAL", label: "Physical" },
  { value: "HYBRID", label: "Hybrid" },
];

export function SchedulingActions({
  interviewId,
  bookingStatus,
  interviewStatus,
  scheduledAt,
  candidateSlotCount,
  hasTeamsLink,
  invitationsSent,
  mode,
  teamsMeeting,
  canManageTeamsMeeting,
  canRetryTeamsSync,
  canCancelInterview,
  attendanceStatus,
  attendanceNote,
  canRecordAttendance,
}: {
  interviewId: string;
  bookingStatus: BookingStatus;
  interviewStatus: InterviewStatus;
  scheduledAt: string | null;
  candidateSlotCount: number;
  hasTeamsLink: boolean;
  invitationsSent: boolean;
  mode: InterviewMode | null;
  teamsMeeting: TeamsMeetingInfo;
  canManageTeamsMeeting: boolean;
  canRetryTeamsSync: boolean;
  canCancelInterview: boolean;
  attendanceStatus: AttendanceStatus;
  attendanceNote: string | null;
  canRecordAttendance: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bookingLink, setBookingLink] = useState<{ path: string; expiresAt: string } | null>(null);
  const [reason, setReason] = useState("");
  const [teamsLink, setTeamsLinkValue] = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState<"decline" | "reselect" | null>(null);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [attendancePick, setAttendancePick] = useState<AttendanceStatus | "">("");
  const [attendanceNoteInput, setAttendanceNoteInput] = useState("");

  const isCancelled = interviewStatus === "CANCELLED";

  function run<T extends { success: true; bookingPath?: string; expiresAt?: string } | { error: string }>(
    action: () => Promise<T>,
    onSuccess?: (result: Extract<T, { success: true }>) => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error("Action failed.", { description: result.error });
        return;
      }
      toast.success("Done.");
      onSuccess?.(result as Extract<T, { success: true }>);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduling actions</CardTitle>
        <CardDescription>Status: {bookingStatus.replace(/_/g, " ").toLowerCase()}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {bookingStatus === "AWAITING_SLOTS" && (
          <Button type="button" disabled={isPending} onClick={() => run(() => generateSlotsAction(interviewId))}>
            Generate candidate slots
          </Button>
        )}

        {candidateSlotCount > 0 && bookingStatus === "AWAITING_SLOTS" && (
          <p className="text-muted-foreground text-sm">{candidateSlotCount} candidate slot(s) generated — publish to let the applicant book.</p>
        )}

        {(bookingStatus === "AWAITING_SLOTS" || bookingStatus === "SLOTS_PUBLISHED") && candidateSlotCount > 0 && (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              run(
                () => publishSlotsAction(interviewId),
                (result) => setBookingLink({ path: result.bookingPath!, expiresAt: result.expiresAt! }),
              )
            }
          >
            {bookingStatus === "SLOTS_PUBLISHED" ? "Regenerate booking link" : "Publish slots and generate booking link"}
          </Button>
        )}

        {bookingLink && (
          <div className="bg-muted grid gap-1 rounded-md p-3 text-sm">
            <p className="font-medium">Send this link to the applicant:</p>
            <code className="break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}
              {bookingLink.path}
            </code>
            <p className="text-muted-foreground text-xs">Valid until {new Date(bookingLink.expiresAt).toLocaleString("en-GB")}. There is no automated email delivery — copy and send this yourself.</p>
          </div>
        )}

        {bookingStatus === "PENDING_CONFIRMATION" && (
          <div className="grid gap-3">
            <Button type="button" disabled={isPending} onClick={() => run(() => confirmBookingAction(interviewId))}>
              Confirm booking
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setShowDeclineForm("decline")}>
                Decline
              </Button>
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setShowDeclineForm("reselect")}>
                Request another slot
              </Button>
            </div>
            {showDeclineForm && (
              <div className="grid gap-2">
                <Label htmlFor="decline-reason">Reason</Label>
                <Textarea id="decline-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="w-fit"
                  disabled={isPending || reason.trim().length < 5}
                  onClick={() =>
                    run(() =>
                      showDeclineForm === "decline"
                        ? declineBookingAction({ interviewId, reason })
                        : requestAnotherSlotAction({ interviewId, reason }),
                    )
                  }
                >
                  Submit
                </Button>
              </div>
            )}
          </div>
        )}

        {isCancelled && (
          <p className="text-destructive text-sm font-medium">This interview has been cancelled. No further scheduling actions are available.</p>
        )}

        {!isCancelled && bookingStatus === "CONFIRMED" && (
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="interview-mode">Interview mode</Label>
              <Select
                value={mode ?? undefined}
                disabled={isPending}
                onValueChange={(value) => run(() => setInterviewModeAction({ interviewId, mode: value as InterviewMode }))}
              >
                <SelectTrigger id="interview-mode" className="max-w-md">
                  <SelectValue placeholder="Select a mode" />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Microsoft Teams meeting (synced)</p>
                {teamsMeeting && (
                  <Badge variant={teamsMeeting.syncStatus === "SYNCED" ? "default" : teamsMeeting.syncStatus === "FAILED" ? "destructive" : "outline"}>
                    {SYNC_STATUS_LABEL[teamsMeeting.syncStatus]}
                  </Badge>
                )}
              </div>
              {teamsMeeting?.syncStatus === "SYNCED" && teamsMeeting.joinUrl && (
                <a href={teamsMeeting.joinUrl} target="_blank" rel="noreferrer" className="text-primary text-sm break-all hover:underline">
                  {teamsMeeting.joinUrl}
                </a>
              )}
              {teamsMeeting?.syncStatus === "FAILED" && teamsMeeting.failureReason && (
                <p className="text-destructive text-xs">{teamsMeeting.failureReason}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {canManageTeamsMeeting && (!teamsMeeting || teamsMeeting.syncStatus !== "SYNCED") && (
                  <Button type="button" size="sm" disabled={isPending} onClick={() => run(() => createTeamsMeetingAction({ interviewId }))}>
                    {teamsMeeting ? "Sync Teams meeting" : "Create Teams meeting"}
                  </Button>
                )}
                {canManageTeamsMeeting && teamsMeeting?.syncStatus === "SYNCED" && (
                  <Button type="button" size="sm" variant="secondary" disabled={isPending} onClick={() => run(() => createTeamsMeetingAction({ interviewId }))}>
                    Re-sync
                  </Button>
                )}
                {canRetryTeamsSync && teamsMeeting?.syncStatus === "FAILED" && (
                  <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => run(() => retryTeamsMeetingSyncAction({ interviewId }))}>
                    Retry sync
                  </Button>
                )}
              </div>
              {!canManageTeamsMeeting && !teamsMeeting && (
                <p className="text-muted-foreground text-xs">No Teams meeting has been created yet.</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="teams-link">Manual meeting link (fallback)</Label>
              <p className="text-muted-foreground text-xs">
                A manually entered link — not synced with Microsoft Graph. Use this only if the Teams meeting above can&apos;t be created automatically.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="teams-link"
                  placeholder="https://teams.microsoft.com/…"
                  value={teamsLink}
                  onChange={(e) => setTeamsLinkValue(e.target.value)}
                  className="max-w-md"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending || !teamsLink.trim()}
                  onClick={() => run(() => setTeamsLinkAction({ interviewId, link: teamsLink }))}
                >
                  {hasTeamsLink ? "Update link" : "Save link"}
                </Button>
              </div>
            </div>

            <Button
              type="button"
              disabled={isPending || !(hasTeamsLink || teamsMeeting?.syncStatus === "SYNCED") || invitationsSent}
              onClick={() => run(() => sendInvitationsAction(interviewId))}
            >
              {invitationsSent ? "Invitations sent" : "Send invitations"}
            </Button>

            <div className="grid gap-2 border-t pt-3">
              {scheduledAt && <p className="text-muted-foreground text-sm">Currently scheduled for {new Date(scheduledAt).toLocaleString("en-GB")}</p>}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={isPending}
                onClick={() => {
                  if (!showRescheduleForm && scheduledAt) setNewScheduledAt(toDatetimeLocalValue(scheduledAt));
                  setShowRescheduleForm((v) => !v);
                }}
              >
                Reschedule
              </Button>
              {showRescheduleForm && (
                <div className="grid gap-2">
                  <Label htmlFor="reschedule-time">New date and time</Label>
                  <Input
                    id="reschedule-time"
                    type="datetime-local"
                    value={newScheduledAt}
                    onChange={(e) => setNewScheduledAt(e.target.value)}
                    className="max-w-md"
                  />
                  <Label htmlFor="reschedule-reason">Reason</Label>
                  <Textarea id="reschedule-reason" value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} />
                  <Button
                    type="button"
                    size="sm"
                    className="w-fit"
                    disabled={isPending || !newScheduledAt || rescheduleReason.trim().length < 5}
                    onClick={() =>
                      run(() =>
                        rescheduleInterviewAction({
                          interviewId,
                          scheduledAt: new Date(newScheduledAt).toISOString(),
                          reason: rescheduleReason,
                        }),
                      )
                    }
                  >
                    Confirm reschedule
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {!isCancelled && bookingStatus === "CONFIRMED" && (
          <div className="grid gap-2 border-t pt-3">
            <Label>Attendance</Label>
            <p className="text-muted-foreground text-sm">
              Current: <span className="font-medium">{ATTENDANCE_LABEL[attendanceStatus]}</span>
              {attendanceNote && <span> — {attendanceNote}</span>}
            </p>
            {canRecordAttendance && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1.5">
                  <Select value={attendancePick} onValueChange={(v) => setAttendancePick(v as AttendanceStatus)}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Record attendance…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ATTENDANCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  placeholder="Optional note"
                  value={attendanceNoteInput}
                  onChange={(e) => setAttendanceNoteInput(e.target.value)}
                  className="max-w-56"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || !attendancePick}
                  onClick={() =>
                    run(() =>
                      recordAttendanceAction({ interviewId, status: attendancePick, note: attendanceNoteInput || undefined }),
                    )
                  }
                >
                  Save
                </Button>
              </div>
            )}
          </div>
        )}

        {!isCancelled && canCancelInterview && (bookingStatus === "CONFIRMED" || bookingStatus === "PENDING_CONFIRMATION") && (
          <div className="grid gap-2 border-t pt-3">
            <Button type="button" variant="destructive" size="sm" className="w-fit" disabled={isPending} onClick={() => setShowCancelForm((v) => !v)}>
              Cancel interview
            </Button>
            {showCancelForm && (
              <div className="grid gap-2">
                <Label htmlFor="cancel-reason">Reason</Label>
                <Textarea id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="w-fit"
                  disabled={isPending || cancelReason.trim().length < 5}
                  onClick={() => run(() => cancelInterviewAction({ interviewId, reason: cancelReason }))}
                >
                  Confirm cancellation
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter />
    </Card>
  );
}
