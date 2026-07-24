import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { getActiveCohort } from "@/lib/cohort";
import { FEATURE_FLAGS, isFeatureEnabled } from "@/lib/featureFlags/service";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { getAssignmentMonitoring } from "@/modules/reviewOperations/services/assignmentMonitoringService";
import type { AssignmentMonitoringFilters } from "@/modules/reviewOperations/types";

import { AssignmentMonitoringFilterBar } from "./filter-bar";
import { WorkspaceNav } from "../workspace-nav";

export const metadata: Metadata = {
  title: "Assignment Monitoring — PAM-P FMS",
};

const PAGE_SIZE = 25;

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  AWAITING_ASSIGNMENT: "outline",
  NOT_STARTED: "outline",
  IN_PROGRESS: "secondary",
  ESCALATED: "destructive",
  SUBMITTED: "default",
};

export default async function AssignmentMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePagePermission(PERMISSIONS.REVIEW_OPERATIONS_VIEW);
  const cohort = await getActiveCohort();
  const params = await searchParams;

  const filters: AssignmentMonitoringFilters = {
    page: Math.max(1, Number(params.page) || 1),
    pageSize: PAGE_SIZE,
    reviewerId: params.reviewerId,
    status: params.status,
    pathway: params.pathway,
    overdueOnly: params.overdueOnly === "true",
    conflictOnly: params.conflictOnly === "true",
    thirdReviewOnly: params.thirdReviewOnly === "true",
    assignedFrom: params.assignedFrom,
    assignedTo: params.assignedTo,
  };

  const result = await getAssignmentMonitoring(user.id, cohort.programmeId, cohort.id, filters);
  const canExport =
    permissionsForRole(user.role).includes(PERMISSIONS.REVIEW_OPERATIONS_EXPORT) && (await isFeatureEnabled(FEATURE_FLAGS.EXPORTS));

  const exportHref = (() => {
    const p = new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]);
    return `/review-operations/assignments/export?${p.toString()}`;
  })();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assignment Monitoring</h1>
          <p className="text-muted-foreground text-sm">
            {cohort.name} — {result.total} application{result.total === 1 ? "" : "s"}.
          </p>
        </div>
        {canExport && (
          <Button variant="outline" asChild>
            <Link href={exportHref}>
              <Download />
              Export CSV
            </Link>
          </Button>
        )}
      </div>

      <WorkspaceNav />

      <AssignmentMonitoringFilterBar pathwayOptions={result.pathwayOptions} reviewerOptions={result.reviewerOptions} />

      {result.rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No applications match</CardTitle>
            <CardDescription>Adjust the filters above, or check back once eligibility decisions are recorded.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Pathway</TableHead>
                  <TableHead>Reviewers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.applicationId} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/review-operations/assignments/${row.applicationId}`} className="block">
                        {row.applicantName}
                        <span className="text-muted-foreground block text-xs">{row.applicationNumber}</span>
                      </Link>
                    </TableCell>
                    <TableCell>{row.pathway ?? "—"}</TableCell>
                    <TableCell>
                      <div className="grid gap-0.5">
                        {row.reviewers.length === 0 ? (
                          <span className="text-muted-foreground text-xs">None assigned</span>
                        ) : (
                          row.reviewers.map((r) => (
                            <span key={r.assignmentId} className="text-xs">
                              {r.slot}: {r.reviewerName}
                            </span>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[row.overallStatus]}>{row.overallStatus.replaceAll("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{row.assignedAt ? new Date(row.assignedAt).toLocaleDateString("en-GB") : "—"}</TableCell>
                    <TableCell className="text-xs">{row.dueDate ? new Date(row.dueDate).toLocaleDateString("en-GB") : "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.isOverdue && <Badge variant="destructive">Overdue</Badge>}
                        {row.hasConflict && <Badge variant="outline">Conflict</Badge>}
                        {row.hasThirdReview && <Badge variant="secondary">3rd review</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar page={filters.page} pageSize={PAGE_SIZE} total={result.total} basePath="/review-operations/assignments" searchParams={params} />
        </>
      )}
    </div>
  );
}
