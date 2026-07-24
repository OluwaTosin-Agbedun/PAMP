import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getActiveCohort } from "@/lib/cohort";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { getReviewOperationsDashboard } from "@/modules/reviewOperations/services/dashboardService";

import { MetricCard } from "./metric-card";
import { WorkspaceNav } from "./workspace-nav";

export const metadata: Metadata = {
  title: "Review Operations — PAM-P FMS",
};

export default async function ReviewOperationsDashboardPage() {
  const user = await requirePagePermission(PERMISSIONS.REVIEW_OPERATIONS_VIEW);
  const cohort = await getActiveCohort();
  const metrics = await getReviewOperationsDashboard(user.id, cohort.programmeId, cohort.id);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review Operations</h1>
        <p className="text-muted-foreground text-sm">{cohort.name} — Application Review stage.</p>
      </div>

      <WorkspaceNav />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Eligible applications" value={metrics.totalEligibleApplications} />
        <MetricCard label="Assigned" value={metrics.applicationsAssigned} />
        <MetricCard label="Awaiting assignment" value={metrics.applicationsAwaitingAssignment} />
        <MetricCard label="Overdue" value={metrics.reviewsOverdue} />
        <MetricCard label="Not started" value={metrics.reviewsNotStarted} />
        <MetricCard label="In progress" value={metrics.reviewsInProgress} />
        <MetricCard label="Submitted" value={metrics.reviewsSubmitted} />
        <MetricCard label="Recusals" value={metrics.recusals} />
        <MetricCard label="Reassignments" value={metrics.reassignments} />
        <MetricCard label="Third reviews triggered" value={metrics.thirdReviewsTriggered} />
        <MetricCard label="Third reviews outstanding" value={metrics.thirdReviewsOutstanding} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stage completion</CardTitle>
            <CardDescription>{metrics.stageCompletionPercent}% of assignments completed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={metrics.stageCompletionPercent} label="Stage completion" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reviewer utilisation</CardTitle>
            <CardDescription>
              {metrics.reviewerUtilisationPercent}% average, across active Application Reviewers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={metrics.reviewerUtilisationPercent} label="Reviewer utilisation" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
