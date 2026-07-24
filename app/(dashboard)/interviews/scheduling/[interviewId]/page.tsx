import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { getInterviewSchedulingDetail } from "@/modules/interviews/services/schedulingService";
import { getTeamsMeetingForInterview } from "@/modules/interviews/services/teamsMeetingService";

import { SchedulingActions } from "./scheduling-actions";

export const metadata: Metadata = {
  title: "Interview Scheduling — PAM-P FMS",
};

export default async function InterviewSchedulingDetailPage({ params }: { params: Promise<{ interviewId: string }> }) {
  const user = await requirePagePermission(PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);
  const { interviewId } = await params;

  let interview;
  try {
    interview = await getInterviewSchedulingDetail(user.id, interviewId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const applicant = interview.application.applicant;
  const openSlots = interview.candidateSlots.filter((s) => s.status === "OPEN");
  const canViewScores = permissionsForRole(user.role).includes(PERMISSIONS.INTERVIEW_SCORES_VIEW_ALL);
  const rolePermissions = permissionsForRole(user.role);
  const canManageTeamsMeeting = rolePermissions.includes(PERMISSIONS.INTERVIEW_TEAMS_MEETING_CREATE);
  const canRetryTeamsSync = rolePermissions.includes(PERMISSIONS.INTERVIEW_TEAMS_SYNC_RETRY);
  const canCancelInterview = rolePermissions.includes(PERMISSIONS.INTERVIEW_CANCEL);
  const canViewTeamsLink = rolePermissions.includes(PERMISSIONS.INTERVIEW_TEAMS_LINK_VIEW);

  const teamsMeeting = canViewTeamsLink ? await getTeamsMeetingForInterview(user.id, interviewId) : null;

  return (
    <div className="grid gap-6">
      <Link href="/interviews/scheduling" className="text-muted-foreground text-sm hover:underline">
        ← Back to Interview Scheduling
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {applicant.firstName} {applicant.lastName}
          </h1>
          <p className="text-muted-foreground text-sm">{applicant.email}</p>
        </div>
        {canViewScores && (
          <Link href={`/interviews/scoring-oversight/${interview.id}`} className="text-primary text-sm hover:underline">
            View panel scores
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Panel</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {interview.panelists.length === 0 ? (
            <p className="text-muted-foreground text-sm">No panellists assigned yet.</p>
          ) : (
            interview.panelists.map((p) => (
              <Badge key={p.id} variant="outline">
                {p.user.name}
              </Badge>
            ))
          )}
        </CardContent>
      </Card>

      {interview.selectedSlot && (
        <Card>
          <CardHeader>
            <CardTitle>Selected slot</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {new Date(interview.selectedSlot.startsAt).toLocaleString("en-GB")} – {new Date(interview.selectedSlot.endsAt).toLocaleTimeString("en-GB")}
            </p>
          </CardContent>
        </Card>
      )}

      <SchedulingActions
        interviewId={interview.id}
        bookingStatus={interview.bookingStatus}
        interviewStatus={interview.status}
        scheduledAt={interview.scheduledAt ? interview.scheduledAt.toISOString() : null}
        candidateSlotCount={openSlots.length}
        hasTeamsLink={Boolean(interview.teamsLink)}
        invitationsSent={Boolean(interview.invitationsSentAt)}
        mode={interview.mode}
        teamsMeeting={
          teamsMeeting
            ? { syncStatus: teamsMeeting.syncStatus, joinUrl: teamsMeeting.joinUrl, failureReason: teamsMeeting.failureReason }
            : null
        }
        canManageTeamsMeeting={canManageTeamsMeeting}
        canRetryTeamsSync={canRetryTeamsSync}
        canCancelInterview={canCancelInterview}
        attendanceStatus={interview.attendanceStatus}
        attendanceNote={interview.attendanceNote}
        canRecordAttendance={rolePermissions.includes(PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE)}
      />
    </div>
  );
}
