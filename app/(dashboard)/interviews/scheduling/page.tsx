import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db/prisma";
import type { InterviewBookingStatus } from "@/lib/generated/prisma/client";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { listInterviewsForCohort } from "@/modules/interviews/repositories/interviewRepository";

export const metadata: Metadata = {
  title: "Interview Scheduling — PAM-P FMS",
};

const STATUS_LABELS: Record<InterviewBookingStatus, string> = {
  AWAITING_SLOTS: "Awaiting slots",
  SLOTS_PUBLISHED: "Slots published",
  PENDING_CONFIRMATION: "Pending confirmation",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
};

const STATUS_BADGE_VARIANT: Record<InterviewBookingStatus, "default" | "secondary" | "outline" | "destructive"> = {
  AWAITING_SLOTS: "outline",
  SLOTS_PUBLISHED: "secondary",
  PENDING_CONFIRMATION: "secondary",
  CONFIRMED: "default",
  DECLINED: "destructive",
};

export default async function InterviewSchedulingPage() {
  await requirePagePermission(PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE);

  const cohort = await prisma.cohort.findFirst({ where: { isActive: true } });
  if (!cohort) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No active cohort</CardTitle>
          <CardDescription>There is no active cohort to schedule interviews for yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const interviews = await listInterviewsForCohort(cohort.id);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Interview Scheduling</h1>
        <p className="text-muted-foreground text-sm">{cohort.name}</p>
      </div>

      {interviews.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No interviews yet</CardTitle>
            <CardDescription>Interviews appear here once a panel has been assigned.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {interviews.map((interview) => (
            <Link key={interview.id} href={`/interviews/scheduling/${interview.id}`} className="block">
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {interview.application.applicant.firstName} {interview.application.applicant.lastName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {interview.scheduledAt ? new Date(interview.scheduledAt).toLocaleString("en-GB") : "Not yet scheduled"} ·{" "}
                      {interview.panelists.length} panellist(s)
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[interview.bookingStatus]}>{STATUS_LABELS[interview.bookingStatus]}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
