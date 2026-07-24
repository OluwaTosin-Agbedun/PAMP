import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import type { ScoreSubmissionStatus } from "@/lib/generated/prisma/client";
import { listMyInterviews } from "@/modules/interviews/services/panelAssignmentService";

export const metadata: Metadata = {
  title: "Interview Workspace — PAM-P FMS",
};

type QueueStatus = ScoreSubmissionStatus | "NOT_STARTED";

const STATUS_LABELS: Record<QueueStatus, string> = {
  NOT_STARTED: "Not started",
  DRAFT: "In progress",
  SUBMITTED: "Submitted",
  RECUSED: "Recused",
};

const STATUS_BADGE_VARIANT: Record<QueueStatus, "default" | "secondary" | "outline" | "destructive"> = {
  NOT_STARTED: "outline",
  DRAFT: "secondary",
  SUBMITTED: "default",
  RECUSED: "destructive",
};

/**
 * A panellist's assigned interview queue (Release 1 Module 2). Reads
 * only through `listMyInterviews`, scoped server-side to the
 * authenticated actor's own panel seats — no argument here could ever
 * surface another panellist's queue, the same pattern
 * docs/BLIND_REVIEW.md establishes for the Reviewer Workspace.
 */
export default async function InterviewWorkspacePage() {
  const user = await requirePagePermission(PERMISSIONS.INTERVIEWS_VIEW);
  const rows = await listMyInterviews(user.id);

  const submittedCount = rows.filter((r) => r.interview.scores[0]?.status === "SUBMITTED").length;
  const inProgressCount = rows.filter((r) => r.interview.scores[0]?.status === "DRAFT").length;
  const notStartedCount = rows.length - submittedCount - inProgressCount;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Interview Workspace</h1>
        <p className="text-muted-foreground text-sm">
          {rows.length === 0
            ? "No interviews assigned to you yet."
            : `${rows.length} assigned — ${submittedCount} submitted, ${inProgressCount} in progress, ${notStartedCount} not started.`}
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to interview yet</CardTitle>
            <CardDescription>Interviews you&apos;re assigned to panel will appear here automatically.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const status: QueueStatus = row.interview.scores[0]?.status ?? "NOT_STARTED";
            const applicant = row.interview.application.applicant;
            return (
              <Link key={row.id} href={`/interviews/${row.interview.id}`} className="block">
                <Card className="hover:border-primary/50 transition-colors">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {applicant.firstName} {applicant.lastName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {row.interview.scheduledAt ? new Date(row.interview.scheduledAt).toLocaleString("en-GB") : "Not yet scheduled"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.isChair && <Badge variant="outline">Chair</Badge>}
                      <Badge variant={STATUS_BADGE_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
