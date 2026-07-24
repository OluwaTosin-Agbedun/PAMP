import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import type { ReviewStatus } from "@/lib/generated/prisma/client";
import { listMyAssignments } from "@/modules/reviews/services/assignmentService";

export const metadata: Metadata = {
  title: "Application Review — PAM-P FMS",
};

const STATUS_LABELS: Record<ReviewStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  REOPENED: "Reopened — needs resubmission",
  RECUSED: "Recused",
  CANCELLED: "Cancelled",
};

const STATUS_BADGE_VARIANT: Record<ReviewStatus, "default" | "secondary" | "outline" | "destructive"> = {
  NOT_STARTED: "outline",
  IN_PROGRESS: "secondary",
  SUBMITTED: "default",
  REOPENED: "secondary",
  RECUSED: "destructive",
  CANCELLED: "destructive",
};

/**
 * The Application Reviewer's assigned queue (Phase 3C). Reads only
 * through `assignmentService.listMyAssignments` — scoped to the
 * authenticated actor's own reviewerId server-side, exactly as
 * docs/BLIND_REVIEW.md documents as this page's one intended seam. No
 * argument here could ever surface another reviewer's assignment.
 */
export default async function ApplicationReviewPage() {
  const user = await requirePagePermission(PERMISSIONS.REVIEWS_VIEW);
  const assignments = await listMyAssignments(user.id);

  const submittedCount = assignments.filter((a) => a.review?.status === "SUBMITTED").length;
  const inProgressCount = assignments.filter(
    (a) => a.review?.status === "IN_PROGRESS" || a.review?.status === "REOPENED",
  ).length;
  const notStartedCount = assignments.length - submittedCount - inProgressCount;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Application Review</h1>
        <p className="text-muted-foreground text-sm">
          {assignments.length === 0
            ? "No applications assigned to you yet."
            : `${assignments.length} assigned — ${submittedCount} submitted, ${inProgressCount} in progress, ${notStartedCount} not started.`}
        </p>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to review yet</CardTitle>
            <CardDescription>
              Applications you&apos;re assigned to review will appear here automatically.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {assignments.map((assignment) => {
            const status: ReviewStatus = assignment.review?.status ?? "NOT_STARTED";
            return (
              <Link key={assignment.id} href={`/reviews/${assignment.id}`} className="block">
                <Card className="hover:border-primary/50 transition-colors">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {assignment.application.applicant.firstName} {assignment.application.applicant.lastName}
                      </p>
                      <p className="text-muted-foreground text-xs">{assignment.application.applicant.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{assignment.slot}</Badge>
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
