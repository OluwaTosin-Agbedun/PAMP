import "server-only";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePermission } from "@/lib/permissions/service";
import { getNumericSettingValue } from "@/lib/settings/service";

import { AGE_BUCKET_ORDER, ageBucketLabel, percentage, toCountRecord, zoneForState } from "../domain/analytics";
import * as repo from "../repositories/analyticsRepository";
import type { AnalyticsFiltersInput } from "../validation/schemas";

/** §7.7's date-range filter, defaulted from `reports.default_date_range_days` when the caller didn't specify one — resolved here (plain server code, not a component's render) rather than in the page. */
async function resolveDateFrom(filters: AnalyticsFiltersInput): Promise<AnalyticsFiltersInput> {
  if (filters.dateFrom) return filters;
  const days = await getNumericSettingValue("reports.default_date_range_days");
  const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return { ...filters, dateFrom };
}

/**
 * §7.1–§7.6 in one call — the same "one workspace call per page" shape
 * every prior dashboard in this codebase uses. Every number here is a
 * stored-data count/average/ratio, nothing recomputed from a scoring
 * formula (the same read-model discipline
 * `docs/adr/ADR-review-operations-read-model.md` established) — no new
 * persistent table, fully compute-on-read, matching the planning
 * instruction's own recommendation for this module.
 */
export async function getAnalyticsDashboard(actorId: string, cohortId: string, inputFilters: AnalyticsFiltersInput) {
  await requirePermission(actorId, PERMISSIONS.REPORTS_VIEW);
  const filters = await resolveDateFrom(inputFilters);

  const [application, review, interview, ranking, admission, notification] = await Promise.all([
    repo.getApplicationAnalytics(cohortId, filters),
    repo.getReviewAnalytics(cohortId, filters),
    repo.getInterviewAnalytics(cohortId, filters),
    repo.getRankingAnalytics(cohortId),
    repo.getAdmissionAnalytics(cohortId),
    repo.getNotificationAnalytics(cohortId, filters),
  ]);

  return {
    application: shapeApplicationAnalytics(application),
    review: shapeReviewAnalytics(review),
    interview: shapeInterviewAnalytics(interview),
    ranking: shapeRankingAnalytics(ranking),
    admission: shapeAdmissionAnalytics(admission),
    notification: shapeNotificationAnalytics(notification),
  };
}

export async function getAnalyticsFilterOptions(actorId: string, cohortId: string) {
  await requirePermission(actorId, PERMISSIONS.REPORTS_VIEW);
  const [reviewers, panellists] = await Promise.all([repo.listReviewersInCohort(cohortId), repo.listPanellistsInCohort(cohortId)]);
  return { reviewers, panellists };
}

function shapeApplicationAnalytics(raw: Awaited<ReturnType<typeof repo.getApplicationAnalytics>>) {
  const zoneCounts: Record<string, number> = {};
  const stateCounts: Record<string, number> = {};
  const genderCounts: Record<string, number> = {};
  const submissionByDay: Record<string, number> = {};
  const ageCounts: Record<string, number> = {};
  const now = new Date();
  for (const applicant of raw.applicants) {
    const zone = zoneForState(applicant.stateOfOrigin) ?? "Not recorded";
    zoneCounts[zone] = (zoneCounts[zone] ?? 0) + 1;
    const state = applicant.stateOfOrigin ?? "Not recorded";
    stateCounts[state] = (stateCounts[state] ?? 0) + 1;
    const gender = applicant.gender ?? "Not recorded";
    genderCounts[gender] = (genderCounts[gender] ?? 0) + 1;
    const day = applicant.createdAt.toISOString().slice(0, 10);
    submissionByDay[day] = (submissionByDay[day] ?? 0) + 1;
    const ageBucket = ageBucketLabel(applicant.dateOfBirth, now);
    if (ageBucket) ageCounts[ageBucket] = (ageCounts[ageBucket] ?? 0) + 1;
  }
  // Zero-fill every bucket in a fixed order, rather than only the
  // buckets that happened to have a match — a chart needs every column
  // present (even at zero) to lay out consistently.
  const ageDistribution = Object.fromEntries(AGE_BUCKET_ORDER.map((label) => [label, ageCounts[label] ?? 0]));

  return {
    total: raw.total,
    draftVsSubmitted: { draft: raw.total - raw.submitted, submitted: raw.submitted },
    // §7.1 "Complete versus incomplete" — this system has no separate
    // completeness concept beyond submission itself (an application
    // either has a recorded `submittedAt` or it doesn't); reported as
    // the same signal rather than inventing a second one.
    completeVsIncomplete: { complete: raw.submitted, incomplete: raw.total - raw.submitted },
    eligibilityDecisions: toCountRecord(raw.eligibilityGroups.map((g) => ({ key: g.eligibilityStatus, count: g._count._all }))),
    missingDocumentCount: raw.missingDocumentCount,
    documentCompletionPercent: percentage(raw.documentedCount, raw.total),
    clarificationCases: raw.clarificationCount,
    duplicateFlags: raw.duplicateCount,
    integrityFlags: raw.integrityFlagCount,
    submissionTrendByDay: submissionByDay,
    ageDistribution,
    pathwayDistribution: toCountRecord(raw.pathwayGroups.map((g) => ({ key: g.pathway, count: g._count._all }))),
    stateDistribution: stateCounts,
    // The count of *distinct* states actually represented (excluding the
    // "not recorded" bucket) — a single summary figure rather than a
    // full per-state breakdown, which at 30+ possible Nigerian states
    // becomes an unreadable wall of text on a summary dashboard.
    distinctStatesRecorded: Object.keys(stateCounts).filter((state) => state !== "Not recorded").length,
    zoneDistribution: zoneCounts,
    genderDistribution: genderCounts,
    // §7.1 "Sector distribution" — no `sector` field exists anywhere in
    // the data model (confirmed by search); reported as unavailable
    // rather than invented.
    sectorDistribution: null as Record<string, number> | null,
  };
}

function shapeReviewAnalytics(raw: Awaited<ReturnType<typeof repo.getReviewAnalytics>>) {
  const statusByKey = Object.fromEntries(raw.reviewStatusGroups.map((g) => [g.status, g._count._all]));
  const completed = raw.completedReviews;
  const totalMinutes = completed
    .filter((r) => r.submittedAt)
    .map((r) => (r.submittedAt!.getTime() - r.createdAt.getTime()) / 60000);
  const averageCompletionMinutes = totalMinutes.length
    ? Math.round(totalMinutes.reduce((sum, m) => sum + m, 0) / totalMinutes.length)
    : null;

  const scores = completed.map((r) => r.totalScore).filter((s): s is NonNullable<typeof s> => s != null).map((s) => Number(s));
  const scoreAverage = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
  const scoreVariance =
    scores.length && scoreAverage != null
      ? Math.round((scores.reduce((sum, s) => sum + (s - scoreAverage) ** 2, 0) / scores.length) * 100) / 100
      : null;

  const shortlistCounts = toCountRecord(raw.shortlistGroups.map((g) => ({ key: g.eligibilityStatus, count: g._count._all })));

  const scoreByReviewer = new Map(raw.reviewerScoreGroups.map((g) => [g.reviewerId, g]));
  const reviewerPerformance = raw.reviewerNames
    .map((reviewer) => {
      const group = scoreByReviewer.get(reviewer.id);
      const avgScore = group?._avg.totalScore != null ? Math.round(Number(group._avg.totalScore) * 100) / 100 : null;
      return { reviewerId: reviewer.id, name: reviewer.name ?? "Unnamed reviewer", reviewedCount: group?._count._all ?? 0, avgScore };
    })
    .sort((a, b) => b.reviewedCount - a.reviewedCount);

  return {
    reviewersAssignedCount: raw.reviewersAssignedCount,
    unassignedApplications: raw.unassignedApplications,
    reviewsNotStarted: statusByKey.NOT_STARTED ?? 0,
    reviewsInProgress: (statusByKey.IN_PROGRESS ?? 0) + (statusByKey.REOPENED ?? 0),
    reviewsSubmitted: statusByKey.SUBMITTED ?? 0,
    averageCompletionMinutes,
    reviewerScoreAverage: scoreAverage != null ? Math.round(scoreAverage * 100) / 100 : null,
    scoreVariance,
    thirdReviewTriggers: raw.escalationCount,
    // §7.2 "Moderation cases" — this system doesn't model a separate
    // moderation queue distinct from third-review escalation; reported
    // as the same signal, not a second invented one.
    moderationCases: raw.escalationCount,
    reviewerConflicts: raw.conflictCount,
    // §7.2 "Integrity escalations" — third-review IS the escalation
    // path this system has for a divergence; there's no separate
    // integrity-specific escalation channel for Application Review
    // scores (unlike Eligibility, which has its own integrity flag —
    // see Application Analytics).
    integrityEscalations: raw.escalationCount,
    shortlistTotals: {
      shortlisted: shortlistCounts.ELIGIBLE ?? 0,
      reserve: shortlistCounts.CLARIFICATION_REQUIRED ?? 0,
      notShortlisted: (shortlistCounts.INELIGIBLE ?? 0) + (shortlistCounts.DISQUALIFIED ?? 0),
    },
    reviewAverageAcrossCohort:
      raw.scoreStats._avg.reviewAverage != null ? Math.round(Number(raw.scoreStats._avg.reviewAverage) * 100) / 100 : null,
    // ApplicationScore.compositeScore is this system's actual review +
    // interview combined figure (calculateCompositeScore, Final Ranking
    // Engine) — distinct from reviewAverageAcrossCohort above, which is
    // review-only.
    avgCombinedScore:
      raw.scoreStats._avg.compositeScore != null ? Math.round(Number(raw.scoreStats._avg.compositeScore) * 100) / 100 : null,
    reviewerPerformance,
  };
}

function shapeInterviewAnalytics(raw: Awaited<ReturnType<typeof repo.getInterviewAnalytics>>) {
  const statusByKey = Object.fromEntries(raw.statusGroups.map((g) => [g.status, g._count._all]));
  const attendanceByKey = Object.fromEntries(raw.attendanceGroups.map((g) => [g.attendanceStatus, g._count._all]));

  // "Success" = a positive outcome (STRONGLY_RECOMMEND or RECOMMEND) out
  // of every submitted score that recorded a recommendation at all —
  // RESERVE/NOT_RECOMMENDED/INTEGRITY_HOLD count as the denominator but
  // not the numerator.
  const recommendationTotal = raw.recommendationGroups.reduce((sum, g) => sum + g._count._all, 0);
  const positiveRecommendations = raw.recommendationGroups
    .filter((g) => g.recommendation === "STRONGLY_RECOMMEND" || g.recommendation === "RECOMMEND")
    .reduce((sum, g) => sum + g._count._all, 0);

  return {
    applicantsShortlisted: raw.shortlisted,
    interviewsScheduled: statusByKey.SCHEDULED ?? 0,
    interviewsCompleted: statusByKey.COMPLETED ?? 0,
    interviewsCancelled: statusByKey.CANCELLED ?? 0,
    interviewsNoShow: statusByKey.NO_SHOW ?? 0,
    // §7.3 "Interviews rescheduled" — recorded via `attendanceStatus =
    // RESCHEDULED` (Interview Module Completion, Phase 2), not a
    // separate reschedule-count field.
    interviewsRescheduled: attendanceByKey.RESCHEDULED ?? 0,
    applicantsAbsent: attendanceByKey.ABSENT ?? 0,
    technicalIssues: attendanceByKey.TECHNICAL_ISSUE ?? 0,
    panelAssignmentCompletionPercent: percentage(raw.panelistAssigned, raw.panelistTotal),
    panellistScoreSubmissionCompletionPercent: percentage(raw.scoresSubmitted, raw.scoresExpected),
    averageInterviewScore: raw.avgScore._avg.totalScore != null ? Math.round(Number(raw.avgScore._avg.totalScore) * 100) / 100 : null,
    decisionBands: toCountRecord(raw.recommendationGroups.map((g) => ({ key: g.recommendation, count: g._count._all }))),
    interviewSuccessRatePercent: percentage(positiveRecommendations, recommendationTotal),
    invitationsSent: raw.invitationsSent,
    remindersScheduledOrDue: raw.remindersSent,
    // §7.3 "Teams meeting creation failures" — `InterviewTeamsMeeting`
    // is a separate table this dashboard doesn't currently join (the
    // Teams integration module's own delivery-status screen already
    // covers this); reported as unavailable here rather than a second,
    // duplicate query path for the same fact.
    teamsMeetingCreationFailures: null as number | null,
  };
}

function shapeRankingAnalytics(raw: Awaited<ReturnType<typeof repo.getRankingAnalytics>>) {
  if (!raw.snapshot) {
    return {
      hasSnapshot: false as const,
      finalScoreDistribution: {},
      top70Count: 0,
      top60Count: 0,
      final30Count: 0,
      tieCount: 0,
      tieBreakDecisionsCount: 0,
      rankingVersions: raw.allSnapshotVersions,
      isApproved: false,
      approvalStagesCompleted: 0,
    };
  }

  const targetSize = raw.snapshot.targetSize;
  const entries = raw.snapshot.entries;
  const distribution = { strongly_recommended: 0, recommended: 0, reserve_borderline: 0, not_recommended: 0 };
  for (const entry of entries) {
    const score = Number(entry.score);
    if (score >= 85) distribution.strongly_recommended++;
    else if (score >= 75) distribution.recommended++;
    else if (score >= 65) distribution.reserve_borderline++;
    else distribution.not_recommended++;
  }

  const resolvedTies = raw.snapshot.tieResolutions.filter((t) => t.status === "RESOLVED").length;

  return {
    hasSnapshot: true as const,
    finalScoreDistribution: distribution,
    top70Count: entries.filter((e) => e.rank <= 70).length,
    top60Count: entries.filter((e) => e.rank <= 60).length,
    final30Count: entries.filter((e) => e.rank <= targetSize).length,
    tieCount: raw.snapshot.tieResolutions.length,
    tieBreakDecisionsCount: resolvedTies,
    rankingVersions: raw.allSnapshotVersions,
    isApproved: raw.snapshot.isLocked,
    approvalStagesCompleted: raw.approvalStages.filter((s) => s.decision === "APPROVED").length,
  };
}

function shapeAdmissionAnalytics(raw: Awaited<ReturnType<typeof repo.getAdmissionAnalytics>>) {
  const byStatus = Object.fromEntries(raw.statusGroups.map((g) => [g.status, g._count._all]));
  const totalIssued = raw.statusGroups.reduce((sum, g) => sum + g._count._all, 0);
  const accepted = byStatus.ACCEPTED ?? 0;

  return {
    offersIssued: totalIssued,
    offersAccepted: accepted,
    offersDeclined: byStatus.DECLINED ?? 0,
    offersPending: byStatus.PENDING ?? 0,
    offersLapsed: byStatus.EXPIRED ?? 0,
    // §7.5 "Reserve candidates promoted" — no Admissions/Offers service
    // exists yet to generate this (the module itself was never built
    // this session, `AdmissionOffer` has zero writers anywhere) — every
    // figure below is real and will remain honestly zero until that
    // module exists, never fabricated.
    reserveCandidatesPromoted: 0,
    remainingCohortCapacity: raw.cohortTargetSize != null ? Math.max(0, raw.cohortTargetSize - accepted) : null,
    acceptanceRatePercent: percentage(accepted, totalIssued),
  };
}

function shapeNotificationAnalytics(raw: Awaited<ReturnType<typeof repo.getNotificationAnalytics>>) {
  const byStatus = Object.fromEntries(raw.statusGroups.map((g) => [g.status, g._count._all]));
  const totalGenerated = raw.statusGroups.reduce((sum, g) => sum + g._count._all, 0);

  return {
    notificationsGenerated: totalGenerated,
    notificationsSent: byStatus.SENT ?? 0,
    notificationsFailed: byStatus.FAILED ?? 0,
    retrySuccessPercent: percentage(raw.retrySucceededCount, raw.retriedCount),
    deliveryByEventType: toCountRecord(raw.eventGroups.map((g) => ({ key: g.event, count: g._count._all }))),
    reminderDeliveryCompletionPercent: percentage(byStatus.SENT ?? 0, totalGenerated),
    applicantsWithoutValidEmail: raw.invalidEmailCount,
  };
}

/**
 * §7.8 Reporting — CSV, the one export format this codebase's own
 * infrastructure already supports safely (matches Ranking/Review
 * Operations' precedent). PDF is explicitly conditional in the source
 * instruction on "where the repository already supports safe PDF
 * generation" — it doesn't, so PDF isn't built here rather than adding
 * a new rendering dependency for one feature.
 */
export async function exportAnalyticsCsv(actorId: string, cohortId: string, filters: AnalyticsFiltersInput): Promise<string> {
  const actor = await requirePermission(actorId, PERMISSIONS.REPORTS_EXPORT);

  const dashboard = await getAnalyticsDashboard(actorId, cohortId, filters);

  const lines: string[] = [];
  lines.push(`Report,PAM-P Analytics Dashboard`);
  lines.push(`Generated,${new Date().toISOString()}`);
  lines.push(`Generated by,${actor.name ?? actor.id}`);
  lines.push(`Cohort ID,${cohortId}`);
  lines.push(`Applied filters,"${JSON.stringify(filters).replace(/"/g, '""')}"`);
  lines.push("");

  const pushSection = (title: string, record: Record<string, unknown>) => {
    lines.push(title);
    for (const [key, value] of Object.entries(record)) {
      if (Array.isArray(value)) continue; // handled separately per-field (see reviewerPerformance below)
      if (value !== null && typeof value === "object") {
        for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
          lines.push(`${key}: ${subKey},${subValue}`);
        }
      } else {
        lines.push(`${key},${value ?? ""}`);
      }
    }
    lines.push("");
  };

  pushSection("Application Analytics", dashboard.application);
  pushSection("Review Analytics", dashboard.review);
  lines.push("Reviewer Performance");
  lines.push("Reviewer,Reviewed,Avg score given");
  for (const r of dashboard.review.reviewerPerformance) {
    lines.push(`${r.name},${r.reviewedCount},${r.avgScore ?? ""}`);
  }
  lines.push("");
  pushSection("Interview Analytics", dashboard.interview);
  pushSection("Final Ranking Analytics", dashboard.ranking);
  pushSection("Admission and Offer Analytics", dashboard.admission);
  pushSection("Notification Analytics", dashboard.notification);

  await writeAuditLog({
    actorId: actor.id,
    action: AUDIT_ACTIONS.REPORTS_EXPORTED,
    entityType: "Cohort",
    entityId: cohortId,
    cohortId,
    metadata: { filters },
  });

  const BOM = "﻿";
  return BOM + lines.join("\r\n");
}
