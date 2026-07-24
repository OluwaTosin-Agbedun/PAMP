import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ApplicationStage, EligibilityStatus, Prisma } from "@/lib/generated/prisma/client";
import { statesInZone } from "@/modules/analytics/domain/analytics";

export type ApplicantListFilters = {
  q?: string;
  eligibilityStatus?: EligibilityStatus;
  stage?: ApplicationStage;
  /** Derived from `Applicant.stateOfOrigin` via `statesInZone` — no `region`/zone column exists (see `modules/analytics/domain/analytics.ts`). */
  zone?: string;
  state?: string;
  gender?: string;
  page: number;
  pageSize: number;
};

export async function listApplications(cohortId: string, filters: ApplicantListFilters) {
  const applicantWhere: Prisma.ApplicantWhereInput = {};
  if (filters.q) {
    applicantWhere.OR = [
      { firstName: { contains: filters.q, mode: "insensitive" } },
      { lastName: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { institution: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.state) applicantWhere.stateOfOrigin = filters.state;
  if (filters.zone) applicantWhere.stateOfOrigin = { in: statesInZone(filters.zone) };
  if (filters.gender) applicantWhere.gender = filters.gender;

  const where: Prisma.ApplicationWhereInput = {
    cohortId,
    deletedAt: null,
    ...(filters.eligibilityStatus ? { eligibilityStatus: filters.eligibilityStatus } : {}),
    ...(filters.stage ? { stage: filters.stage } : {}),
    ...(Object.keys(applicantWhere).length > 0 ? { applicant: applicantWhere } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      include: { applicant: true },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);

  return { total, items };
}

export type ApplicantSummaryCounts = {
  total: number;
  eligible: number;
  ineligible: number;
  pending: number;
};

/** Cohort-wide counts for the Dashboard's "at a glance" overview — a groupBy, not per-status count() calls. */
export async function getApplicantSummaryCounts(cohortId: string): Promise<ApplicantSummaryCounts> {
  const rows = await prisma.application.groupBy({
    by: ["eligibilityStatus"],
    where: { cohortId },
    _count: { _all: true },
  });

  const countByStatus = Object.fromEntries(rows.map((row) => [row.eligibilityStatus, row._count._all]));
  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    eligible: countByStatus.ELIGIBLE ?? 0,
    ineligible: countByStatus.INELIGIBLE ?? 0,
    pending: countByStatus.PENDING ?? 0,
  };
}

export async function getApplicationDetail(applicationId: string) {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      applicant: true,
      documents: true,
      eligibilityScreening: true,
      reviewAssignments: { include: { reviewer: { select: { id: true, name: true } } } },
    },
  });
}

export async function getApplicationAuditLog(applicationId: string) {
  return prisma.auditLog.findMany({
    where: { entityType: "Application", entityId: applicationId },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { name: true } } },
  });
}

/** Soft-deletes the Application and its 1:1 Applicant together — in this
 *  schema they represent the same real-world person/submission, so
 *  "delete an applicant" always removes both records as one unit. */
export async function softDeleteApplication(applicationId: string) {
  const deletedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const application = await tx.application.update({
      where: { id: applicationId },
      data: { deletedAt },
      include: { applicant: true },
    });
    await tx.applicant.update({
      where: { id: application.applicantId },
      data: { deletedAt },
    });
    return application;
  });
}
