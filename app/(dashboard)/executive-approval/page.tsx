import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveCohort } from "@/lib/cohort";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { getExecutiveDashboard } from "@/modules/executiveApproval/services/executiveDashboardService";

import { MetricCard } from "../review-operations/metric-card";
import { ApprovalWorkflowCard } from "./approval-workflow-card";
import { toExecutiveDashboardViewModel } from "./types";

export const metadata: Metadata = {
  title: "Executive Approval — PAM-P FMS",
};

export default async function ExecutiveApprovalPage() {
  const user = await requirePagePermission(PERMISSIONS.EXECUTIVE_VIEW);
  const cohort = await getActiveCohort();

  const dashboard = await getExecutiveDashboard(user.id, cohort.id);
  const view = toExecutiveDashboardViewModel(dashboard);

  const canApprove = permissionsForRole(user.role).includes(PERMISSIONS.EXECUTIVE_APPROVE);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Executive Approval</h1>
        <p className="text-muted-foreground text-sm">{cohort.name} — cohort-wide summary and the staged sign-off workflow.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total applications" value={view.totalApplications} />
        <MetricCard label="Eligible" value={view.eligibilityCounts.eligible} />
        <MetricCard label="Interviews completed" value={view.interviewCounts.completed} />
        <MetricCard label="Interviews scheduled" value={view.interviewCounts.scheduled} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eligibility & interview breakdown</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Eligibility</p>
            <ul className="grid gap-1 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Pending</span>{view.eligibilityCounts.pending}</li>
              <li className="flex justify-between"><span className="text-muted-foreground">Clarification required</span>{view.eligibilityCounts.clarificationRequired}</li>
              <li className="flex justify-between"><span className="text-muted-foreground">Ineligible</span>{view.eligibilityCounts.ineligible}</li>
              <li className="flex justify-between"><span className="text-muted-foreground">Disqualified</span>{view.eligibilityCounts.disqualified}</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Interviews</p>
            <ul className="grid gap-1 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Cancelled</span>{view.interviewCounts.cancelled}</li>
              <li className="flex justify-between"><span className="text-muted-foreground">No-show</span>{view.interviewCounts.noShow}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {!view.snapshot ? (
        <Card>
          <CardHeader>
            <CardTitle>No ranking generated yet</CardTitle>
            <CardDescription>The Executive Approval workflow becomes available once the Programme Secretariat generates the Final Ranking.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {view.approval && (
            <ApprovalWorkflowCard rankingSnapshotId={view.snapshot.id} approval={view.approval} canApprove={canApprove} />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ranked list</CardTitle>
              <CardDescription>
                Final cohort target: {view.snapshot.targetSize}. Application review and interview panellist identities and comments are never
                shown here — only the aggregate scores and decision band each application already carries on the Final Ranking.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Pathway</TableHead>
                      <TableHead>Decision Band</TableHead>
                      <TableHead>Top 70</TableHead>
                      <TableHead>Top 60</TableHead>
                      <TableHead>Final Selection</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.entries.map((entry) => (
                      <TableRow key={entry.applicationId}>
                        <TableCell className="font-medium">{entry.rank}</TableCell>
                        <TableCell>{entry.applicantName}</TableCell>
                        <TableCell>{entry.pathway ?? "—"}</TableCell>
                        <TableCell>{entry.decisionBand.replace(/_/g, " ")}</TableCell>
                        <TableCell>{entry.withinTop70 && <Badge variant="outline">Yes</Badge>}</TableCell>
                        <TableCell>{entry.withinTop60 && <Badge variant="outline">Yes</Badge>}</TableCell>
                        <TableCell>{entry.withinFinalSelection && <Badge variant="default">Yes</Badge>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
