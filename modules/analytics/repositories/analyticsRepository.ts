import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

import { statesInZone } from "../domain/analytics";
import type { AnalyticsFiltersInput } from "../validation/schemas";

/** Every field `Application.where` can honour from the shared filter set — the base every category's query starts from, since every category is ultimately application-scoped. */
export function buildApplicationWhere(cohortId: string, filters: AnalyticsFiltersInput): Prisma.ApplicationWhereInput {
  const where: Prisma.ApplicationWhereInput = { cohortId };
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }
  if (filters.stage) where.stage = filters.stage;
  if (filters.eligibilityStatus) where.eligibilityStatus = filters.eligibilityStatus;
  if (filters.pathway) where.pathway = filters.pathway;
  if (filters.state) where.applicant = { ...(where.applicant as object), stateOfOrigin: filters.state };
  if (filters.zone) where.applicant = { ...(where.applicant as object), stateOfOrigin: { in: statesInZone(filters.zone) } };
  if (filters.gender) where.applicant = { ...(where.applicant as object), gender: filters.gender };
  return where;
}

// ---------------------------------------------------------------------------
// §7.7 Dashboard Filters — picker lists
// ---------------------------------------------------------------------------

/** Distinct reviewers who actually have an assignment in this cohort — not every APPLICATION_REVIEWER account, only ones relevant to filter by here. */
export async function listReviewersInCohort(cohortId: string) {
  const rows = await prisma.reviewAssignment.findMany({
    where: { application: { cohortId } },
    distinct: ["reviewerId"],
    select: { reviewer: { select: { id: true, name: true } } },
    orderBy: { reviewer: { name: "asc" } },
  });
  return rows.map((r) => r.reviewer);
}

/** Distinct interview panellists in this cohort, same "only who's actually relevant" scoping as `listReviewersInCohort`. */
export async function listPanellistsInCohort(cohortId: string) {
  const rows = await prisma.interviewPanelist.findMany({
    where: { interview: { cohortId } },
    distinct: ["userId"],
    select: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => r.user);
}

// ---------------------------------------------------------------------------
// §7.1 Application Analytics
// ---------------------------------------------------------------------------

export async function getApplicationAnalytics(cohortId: string, filters: AnalyticsFiltersInput) {
  const where = buildApplicationWhere(cohortId, filters);

  const [total, submitted, eligibilityGroups, integrityFlagCount, duplicateCount, clarificationCount, pathwayGroups, applicants] =
    await Promise.all([
      prisma.application.count({ where }),
      prisma.application.count({ where: { ...where, submittedAt: { not: null } } }),
      prisma.application.groupBy({ by: ["eligibilityStatus"], where, _count: { _all: true } }),
      prisma.eligibilityChecklistItem.count({
        where: { status: "FLAG", section: "INTEGRITY", screening: { application: where } },
      }),
      prisma.application.count({ where: { ...where, duplicateOfId: { not: null } } }),
      prisma.application.count({ where: { ...where, eligibilityStatus: "CLARIFICATION_REQUIRED" } }),
      prisma.application.groupBy({ by: ["pathway"], where, _count: { _all: true } }),
      prisma.applicant.findMany({
        where: { application: where },
        select: { gender: true, stateOfOrigin: true, createdAt: true },
      }),
    ]);

  // §7.1 "Missing-document distribution" — a FAIL in the Required
  // Documents (DOCUMENT) checklist section is exactly this system's
  // record of a document the screener found missing.
  const missingDocumentCount = await prisma.eligibilityChecklistItem.count({
    where: { status: "FAIL", section: "DOCUMENT", screening: { application: where } },
  });

  return { total, submitted, eligibilityGroups, integrityFlagCount, duplicateCount, clarificationCount, missingDocumentCount, pathwayGroups, applicants };
}

// ---------------------------------------------------------------------------
// §7.2 Review Analytics
// ---------------------------------------------------------------------------

export async function getReviewAnalytics(cohortId: string, filters: AnalyticsFiltersInput) {
  const applicationWhere = buildApplicationWhere(cohortId, filters);
  const assignmentWhere: Prisma.ReviewAssignmentWhereInput = {
    application: applicationWhere,
    ...(filters.reviewerId ? { reviewerId: filters.reviewerId } : {}),
  };

  const [
    reviewersAssigned,
    unassignedApplications,
    reviewStatusGroups,
    completedReviews,
    escalationCount,
    conflictCount,
    scoreStats,
    shortlistGroups,
  ] = await Promise.all([
    prisma.reviewAssignment.groupBy({ by: ["reviewerId"], where: { ...assignmentWhere, status: { not: "CANCELLED" } } }),
    prisma.application.count({ where: { ...applicationWhere, reviewAssignments: { none: {} } } }),
    prisma.review.groupBy({ by: ["status"], where: { application: applicationWhere, ...(filters.reviewerId ? { reviewerId: filters.reviewerId } : {}) }, _count: { _all: true } }),
    prisma.review.findMany({
      where: { application: applicationWhere, status: "SUBMITTED", submittedAt: { not: null } },
      select: { submittedAt: true, createdAt: true, totalScore: true },
    }),
    prisma.reviewEscalation.count({ where: { application: applicationWhere } }),
    prisma.review.count({ where: { application: applicationWhere, conflictOfInterest: true } }),
    prisma.applicationScore.aggregate({ where: { application: applicationWhere }, _avg: { reviewAverage: true }, _count: { reviewAverage: true } }),
    prisma.application.groupBy({ by: ["eligibilityStatus"], where: applicationWhere, _count: { _all: true } }),
  ]);

  return {
    reviewersAssignedCount: reviewersAssigned.length,
    unassignedApplications,
    reviewStatusGroups,
    completedReviews,
    escalationCount,
    conflictCount,
    scoreStats,
    shortlistGroups,
  };
}

// ---------------------------------------------------------------------------
// §7.3 Interview Analytics
// ---------------------------------------------------------------------------

export async function getInterviewAnalytics(cohortId: string, filters: AnalyticsFiltersInput) {
  const applicationWhere = buildApplicationWhere(cohortId, filters);
  const interviewWhere: Prisma.InterviewWhereInput = {
    application: applicationWhere,
    ...(filters.panellistId ? { panelists: { some: { userId: filters.panellistId } } } : {}),
  };

  const [shortlisted, statusGroups, attendanceGroups, panelistTotal, panelistAssigned, scoresSubmitted, scoresExpected, avgScore, invitationsSent, remindersSent] =
    await Promise.all([
      prisma.application.count({ where: { ...applicationWhere, interviews: { some: {} } } }),
      prisma.interview.groupBy({ by: ["status"], where: interviewWhere, _count: { _all: true } }),
      prisma.interview.groupBy({ by: ["attendanceStatus"], where: interviewWhere, _count: { _all: true } }),
      prisma.interviewPanelist.count({ where: { interview: interviewWhere } }),
      prisma.interviewPanelist.count({ where: { interview: interviewWhere, status: "ASSIGNED" } }),
      prisma.interviewScore.count({ where: { status: "SUBMITTED", interview: interviewWhere } }),
      prisma.interviewPanelist.count({ where: { interview: interviewWhere, status: { not: "CANCELLED" } } }),
      prisma.interviewScore.aggregate({ where: { status: "SUBMITTED", interview: interviewWhere }, _avg: { totalScore: true } }),
      prisma.interview.count({ where: { ...interviewWhere, invitationsSentAt: { not: null } } }),
      prisma.interview.count({ where: { ...interviewWhere, status: "SCHEDULED" } }),
    ]);

  const recommendationGroups = await prisma.interviewScore.groupBy({
    by: ["recommendation"],
    where: { status: "SUBMITTED", recommendation: { not: null }, interview: interviewWhere },
    _count: { _all: true },
  });

  return {
    shortlisted,
    statusGroups,
    attendanceGroups,
    panelistTotal,
    panelistAssigned,
    scoresSubmitted,
    scoresExpected,
    avgScore,
    invitationsSent,
    remindersSent,
    recommendationGroups,
  };
}

// ---------------------------------------------------------------------------
// §7.4 Final Ranking Analytics
// ---------------------------------------------------------------------------

export async function getRankingAnalytics(cohortId: string) {
  const snapshot = await prisma.rankingSnapshot.findFirst({
    where: { cohortId },
    orderBy: { generatedAt: "desc" },
    include: {
      entries: { select: { rank: true, score: true } },
      tieResolutions: { select: { status: true, applications: { select: { applicationId: true } } } },
    },
  });

  const approvalStages = snapshot
    ? await prisma.rankingApprovalStage.findMany({ where: { rankingSnapshotId: snapshot.id }, orderBy: { createdAt: "asc" } })
    : [];

  const allSnapshotVersions = await prisma.rankingSnapshot.count({ where: { cohortId } });

  return { snapshot, approvalStages, allSnapshotVersions };
}

// ---------------------------------------------------------------------------
// §7.5 Admission and Offer Analytics
// ---------------------------------------------------------------------------

/**
 * The Admissions/Offers module itself was never built this session
 * (explicitly out of scope for the five modules this planning
 * instruction covers) — `AdmissionOffer` is a dormant, unconsumed
 * scaffold with zero writers anywhere in the codebase (confirmed by
 * search, same finding as `ExecutiveApproval`). This query is real and
 * correct; it will honestly return all-zero counts until that module
 * exists, which is the truth, not a bug.
 */
export async function getAdmissionAnalytics(cohortId: string) {
  const statusGroups = await prisma.admissionOffer.groupBy({
    by: ["status"],
    where: { application: { cohortId } },
    _count: { _all: true },
  });
  const cohortTargetSize = await prisma.rankingSnapshot.findFirst({
    where: { cohortId },
    orderBy: { generatedAt: "desc" },
    select: { targetSize: true },
  });
  return { statusGroups, cohortTargetSize: cohortTargetSize?.targetSize ?? null };
}

// ---------------------------------------------------------------------------
// §7.6 Notification Analytics
// ---------------------------------------------------------------------------

export async function getNotificationAnalytics(cohortId: string, filters: AnalyticsFiltersInput) {
  const dateWhere: Prisma.OutboundNotificationWhereInput = {};
  if (filters.dateFrom || filters.dateTo) {
    dateWhere.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }

  // Scoped to this cohort's applicants — a notification's `relatedEntityId`
  // isn't reliably an applicationId across every event type, so scoping
  // goes through the recipient applicant instead, which every
  // applicant-facing notification always has.
  const applicantScope: Prisma.OutboundNotificationWhereInput = {
    OR: [{ applicant: { cohortId } }, { applicant: null }],
  };

  const [statusGroups, eventGroups, retriedCount, retrySucceededCount, applicantsWithoutEmail] = await Promise.all([
    prisma.outboundNotification.groupBy({ by: ["status"], where: { ...dateWhere, ...applicantScope }, _count: { _all: true } }),
    prisma.outboundNotification.groupBy({ by: ["event"], where: { ...dateWhere, ...applicantScope }, _count: { _all: true } }),
    prisma.outboundNotification.count({ where: { ...dateWhere, ...applicantScope, retryCount: { gt: 0 } } }),
    prisma.outboundNotification.count({ where: { ...dateWhere, ...applicantScope, retryCount: { gt: 0 }, status: "SENT" } }),
    prisma.applicant.findMany({ where: { cohortId }, select: { email: true } }),
  ]);

  const invalidEmailCount = applicantsWithoutEmail.filter((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)).length;

  return { statusGroups, eventGroups, retriedCount, retrySucceededCount, invalidEmailCount };
}
