import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/db/prisma";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { listScreeningsForCohort } from "@/modules/eligibility/screeningService";

import { ScreeningFilterBar } from "./filter-bar";
import { RandomAssignReviewersButton } from "./random-assign-button";
import { RunAutomaticEligibilityButton } from "./run-automatic-button";
import { SCREENING_STATUS_BADGE_VARIANT, SCREENING_STATUS_LABELS } from "./types";

export const metadata: Metadata = {
  title: "Eligibility Screening — PAM-P FMS",
};

export default async function EligibilityScreeningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const currentUser = await requirePagePermission(PERMISSIONS.ELIGIBILITY_SCREENING_VIEW);
  const params = await searchParams;
  const cohort = await getActiveCohort();

  const [screenings, allActiveUsers] = await Promise.all([
    listScreeningsForCohort(currentUser.id, cohort.id, {
      status: params.status as never,
      screenerId: params.screener,
    }),
    prisma.user.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, role: true } }),
  ]);

  const screeners = allActiveUsers
    .filter((u) => permissionsForRole(u.role).includes(PERMISSIONS.ELIGIBILITY_SCREENING_PERFORM))
    .map((u) => ({ id: u.id, name: u.name }));

  const canRunAutomatic = permissionsForRole(currentUser.role).includes(PERMISSIONS.ELIGIBILITY_SCREENING_ASSIGN);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eligibility Screening</h1>
          <p className="text-muted-foreground text-sm">
            {cohort.name} — the PAM-P Application Eligibility Criteria are applied automatically on import; a case
            flagged for clarification is randomly assigned to a reviewer, who resolves anything the engine
            couldn&apos;t verify.
          </p>
        </div>
        {canRunAutomatic && (
          <div className="flex flex-wrap gap-2">
            <RunAutomaticEligibilityButton cohortId={cohort.id} />
            <RandomAssignReviewersButton cohortId={cohort.id} />
          </div>
        )}
      </div>

      <ScreeningFilterBar screeners={screeners} />

      {screenings.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to show</CardTitle>
            <CardDescription>No screenings match the current filters.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Screener</TableHead>
                <TableHead>Date Reviewed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {screenings.map((screening) => (
                <TableRow key={screening.id}>
                  <TableCell>
                    <Link href={`/eligibility-screening/${screening.applicationId}`} className="font-medium hover:underline">
                      {screening.application.applicant.firstName} {screening.application.applicant.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={SCREENING_STATUS_BADGE_VARIANT[screening.status]}>{SCREENING_STATUS_LABELS[screening.status]}</Badge>
                  </TableCell>
                  <TableCell>{screening.screener?.name ?? "Unassigned"}</TableCell>
                  <TableCell>{screening.dateReviewed ? new Date(screening.dateReviewed).toLocaleString("en-GB") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
