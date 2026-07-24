import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { getReviewerWorkload } from "@/modules/reviewOperations/services/workloadService";

import { WorkspaceNav } from "../workspace-nav";

export const metadata: Metadata = {
  title: "Reviewer Workload — PAM-P FMS",
};

export default async function ReviewerWorkloadPage() {
  const user = await requirePagePermission(PERMISSIONS.REVIEWER_CAPACITY_VIEW);
  const cohort = await getActiveCohort();
  const rows = await getReviewerWorkload(user.id, cohort.programmeId);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reviewer Workload</h1>
        <p className="text-muted-foreground text-sm">Active and completed assignments per Application Reviewer.</p>
      </div>

      <WorkspaceNav />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reviewer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Utilisation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.reviewerId}>
                <TableCell className="font-medium">
                  {row.name}
                  <span className="text-muted-foreground block text-xs">{row.email}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={row.accountStatus === "ACTIVE" ? "outline" : "destructive"}>{row.accountStatus}</Badge>
                    {!row.isAvailable && (
                      <span className="text-muted-foreground text-xs">
                        Unavailable{row.unavailableReason ? `: ${row.unavailableReason}` : ""}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{row.activeAssignmentCount}</TableCell>
                <TableCell>{row.completedAssignmentCount}</TableCell>
                <TableCell>{row.maxConcurrentAssignments}</TableCell>
                <TableCell className="min-w-32">
                  <div className="flex items-center gap-2">
                    <Progress value={row.utilisationPercent} label={`${row.name} utilisation`} className="w-20" />
                    <span className="text-xs">{row.utilisationPercent}%</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
