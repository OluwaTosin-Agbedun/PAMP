import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getActiveCohort } from "@/lib/cohort";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { getEscalationMonitoring } from "@/modules/reviewOperations/services/escalationMonitoringService";

import { WorkspaceNav } from "../workspace-nav";

export const metadata: Metadata = {
  title: "Third-Review Monitoring — PAM-P FMS",
};

export default async function EscalationMonitoringPage() {
  const user = await requirePagePermission(PERMISSIONS.REVIEW_ESCALATIONS_VIEW);
  const cohort = await getActiveCohort();
  const rows = await getEscalationMonitoring(user.id, cohort.id);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Third-Review Monitoring</h1>
        <p className="text-muted-foreground text-sm">
          Applications where Reviewer 1 and Reviewer 2 diverged beyond the configured threshold.
        </p>
      </div>

      <WorkspaceNav />

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No escalations yet</CardTitle>
            <CardDescription>{cohort.name} has no applications currently requiring a third review.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead>Reviewer 1</TableHead>
                <TableHead>Reviewer 2</TableHead>
                <TableHead>Divergence</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Third reviewer</TableHead>
                <TableHead>Final score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.escalationId}>
                  <TableCell className="font-medium">
                    <Link href={`/review-operations/assignments/${row.applicationId}`} className="hover:underline">
                      {row.applicantName}
                      <span className="text-muted-foreground block text-xs">{row.applicationNumber}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.firstReviewerName}
                    <span className="block font-semibold">{row.firstScore ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.secondReviewerName}
                    <span className="block font-semibold">{row.secondScore ?? "—"}</span>
                  </TableCell>
                  <TableCell>{row.divergencePercent}pp</TableCell>
                  <TableCell>{row.configuredThresholdPercent}pp</TableCell>
                  <TableCell className="text-xs">
                    {row.thirdReviewerName ?? <span className="text-muted-foreground">Not yet assigned</span>}
                    {row.thirdReviewAssignmentStatus && <span className="block">{row.thirdReviewAssignmentStatus}</span>}
                  </TableCell>
                  <TableCell>
                    {row.resolvedFinalScore ? (
                      <Badge>{row.resolvedFinalScore}</Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
