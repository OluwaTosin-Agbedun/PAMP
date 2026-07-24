import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";

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
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { ELIGIBILITY_BADGE_VARIANT, ELIGIBILITY_LABELS, STAGE_LABELS } from "@/modules/applicants/labels";
import { listApplications } from "@/modules/applicants/repository";
import type { ApplicationStage, EligibilityStatus } from "@/lib/generated/prisma/client";

import { ApplicantsFilterBar } from "./filter-bar";

export const metadata: Metadata = {
  title: "Applicants — PAM-P FMS",
};

const PAGE_SIZE = 25;

export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const currentUser = await requirePagePermission(PERMISSIONS.APPLICATIONS_VIEW);
  const params = await searchParams;
  const cohort = await getActiveCohort();

  const page = Math.max(1, Number(params.page) || 1);
  const { total, items } = await listApplications(cohort.id, {
    q: params.q,
    eligibilityStatus: params.eligibilityStatus as EligibilityStatus | undefined,
    stage: params.stage as ApplicationStage | undefined,
    zone: params.zone,
    state: params.state,
    gender: params.gender,
    page,
    pageSize: PAGE_SIZE,
  });

  const canImport = permissionsForRole(currentUser.role).includes(PERMISSIONS.APPLICATIONS_IMPORT);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Applicants</h1>
          <p className="text-muted-foreground text-sm">
            {cohort.name} — {total} application{total === 1 ? "" : "s"}
          </p>
        </div>
        {canImport && (
          <Button asChild>
            <Link href="/applicants/import">
              <Upload />
              Import applicants
            </Link>
          </Button>
        )}
      </div>

      <ApplicantsFilterBar />

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No applicants yet</CardTitle>
            <CardDescription>
              {total === 0 &&
              !params.q &&
              !params.eligibilityStatus &&
              !params.stage &&
              !params.zone &&
              !params.state &&
              !params.gender
                ? canImport
                  ? "Import an Excel or CSV file to get started."
                  : "Ask a System Administrator or Programme Secretary to import applicants."
                : "No applicants match the current search or filters."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Eligibility</TableHead>
                  <TableHead>Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((application) => (
                  <TableRow key={application.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/applicants/${application.id}`} className="block">
                        {application.applicant.firstName} {application.applicant.lastName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/applicants/${application.id}`} className="block">
                        {application.applicant.email}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/applicants/${application.id}`} className="block">
                        {application.applicant.institution ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/applicants/${application.id}`} className="block">
                        <Badge variant={ELIGIBILITY_BADGE_VARIANT[application.eligibilityStatus]}>
                          {ELIGIBILITY_LABELS[application.eligibilityStatus]}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/applicants/${application.id}`} className="block">
                        {STAGE_LABELS[application.stage]}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/applicants"
            searchParams={params}
          />
        </>
      )}
    </div>
  );
}
