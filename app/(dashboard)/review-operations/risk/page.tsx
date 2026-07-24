import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveCohort } from "@/lib/cohort";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { getRiskDashboard } from "@/modules/reviewOperations/services/dashboardService";

import { MetricCard } from "../metric-card";
import { WorkspaceNav } from "../workspace-nav";

export const metadata: Metadata = {
  title: "Risk Dashboard — PAM-P FMS",
};

export default async function RiskDashboardPage() {
  const user = await requirePagePermission(PERMISSIONS.REVIEW_OPERATIONS_VIEW);
  const cohort = await getActiveCohort();
  const risk = await getRiskDashboard(user.id, cohort.programmeId, cohort.id);

  const attentionNeeded = risk.applicationsRequiringAttention > 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Risk Dashboard</h1>
          <p className="text-muted-foreground text-sm">{cohort.name} — operational risk signals, aggregated from existing data only.</p>
        </div>
        {attentionNeeded && <Badge variant="destructive">{risk.applicationsRequiringAttention} application(s) need attention</Badge>}
      </div>

      <WorkspaceNav />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Approaching deadline"
          value={risk.applicationsApproachingDeadline}
          hint="Unsubmitted, stage closes soon"
        />
        <MetricCard label="Stalled" value={risk.applicationsStalled} hint="No activity for a while" />
        <MetricCard label="Awaiting reassignment" value={risk.applicationsAwaitingReassignment} hint="Conflict declared, not yet reassigned" />
        <MetricCard label="Requiring attention" value={risk.applicationsRequiringAttention} />

        <MetricCard label="Overloaded reviewers" value={risk.overloadedReviewers} hint="At or over configured capacity" />
        <MetricCard label="Third-review rate" value={`${risk.thirdReviewRatePercent}%`} />
        <MetricCard label="Conflict declarations" value={risk.conflictDeclarations} />
        <MetricCard label="Pending escalations" value={risk.pendingEscalations} />

        <MetricCard label="Review backlog" value={risk.reviewBacklog} hint="Not started + in progress" />
        <MetricCard
          label="Average completion time"
          value={risk.averageCompletionHours === null ? "—" : `${risk.averageCompletionHours.toFixed(1)}h`}
          hint="Assignment to submission"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About this view</CardTitle>
          <CardDescription>
            Every figure above is aggregated from data the Assignment Monitoring, Reviewer Workload, and Third-Review
            Monitoring screens already show individually — this page adds no new business logic, only a risk-focused
            summary of it.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
