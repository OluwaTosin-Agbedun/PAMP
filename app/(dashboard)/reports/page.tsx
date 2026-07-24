import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveCohort } from "@/lib/cohort";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { getAnalyticsDashboard, getAnalyticsFilterOptions } from "@/modules/analytics/services/analyticsService";
import { analyticsFiltersSchema } from "@/modules/analytics/validation/schemas";

import { MetricCard } from "../review-operations/metric-card";
import { AnalyticsFilterBar } from "./filter-bar";
import { ExportAnalyticsButton } from "./export-button";

export const metadata: Metadata = {
  title: "Reports — PAM-P FMS",
};

/** Caps how much of a bucket label ever renders — a messy imported value (or genuinely long free text) must never be able to stretch a card and break the grid layout around it. */
function truncateLabel(label: string, max = 40): string {
  const clean = label.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function RecordList({ record, emptyLabel = "None yet" }: { record: Record<string, number> | null; emptyLabel?: string }) {
  if (record === null) return <p className="text-muted-foreground text-sm">Not available — no data source exists for this yet.</p>;
  const entries = Object.entries(record);
  if (entries.length === 0) return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  return (
    <ul className="grid gap-1 text-sm">
      {entries.map(([key, value]) => (
        <li key={key} className="flex justify-between gap-2">
          <span className="text-muted-foreground min-w-0 truncate" title={key.replace(/_/g, " ")}>
            {truncateLabel(key)}
          </span>
          <span className="shrink-0 font-medium">{value}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission(PERMISSIONS.REPORTS_VIEW);
  const cohort = await getActiveCohort();
  const params = await searchParams;

  const parsedFilters = analyticsFiltersSchema.safeParse({
    dateFrom: params.dateFrom || undefined,
    dateTo: params.dateTo || undefined,
    stage: params.stage || undefined,
    eligibilityStatus: params.eligibilityStatus || undefined,
    pathway: params.pathway || undefined,
    state: params.state || undefined,
    zone: params.zone || undefined,
    gender: params.gender || undefined,
    reviewerId: params.reviewerId || undefined,
    panellistId: params.panellistId || undefined,
  });
  const filters = parsedFilters.success ? parsedFilters.data : {};

  const [dashboard, filterOptions] = await Promise.all([
    getAnalyticsDashboard(user.id, cohort.id, filters),
    getAnalyticsFilterOptions(user.id, cohort.id),
  ]);

  const canExport = permissionsForRole(user.role).includes(PERMISSIONS.REPORTS_EXPORT);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">{cohort.name} — Analytics Dashboard, computed live from cohort data.</p>
        </div>
        {canExport && <ExportAnalyticsButton cohortId={cohort.id} filters={params} />}
      </div>

      <AnalyticsFilterBar reviewers={filterOptions.reviewers} panellists={filterOptions.panellists} />

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Application Analytics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total applications" value={dashboard.application.total} />
          <MetricCard label="Eligible" value={dashboard.application.eligibilityDecisions.ELIGIBLE ?? 0} />
          <MetricCard label="Ineligible" value={dashboard.application.eligibilityDecisions.INELIGIBLE ?? 0} />
          <MetricCard label="Pending screening" value={dashboard.application.eligibilityDecisions.PENDING ?? 0} />
          <MetricCard label="Clarification cases" value={dashboard.application.clarificationCases} />
          <MetricCard label="Duplicate flags" value={dashboard.application.duplicateFlags} />
          <MetricCard label="Integrity flags" value={dashboard.application.integrityFlags} />
          <MetricCard label="States of origin recorded" value={dashboard.application.distinctStatesRecorded} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Leadership pathway</CardTitle></CardHeader>
            <CardContent><RecordList record={dashboard.application.pathwayDistribution} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Zone (region)</CardTitle></CardHeader>
            <CardContent><RecordList record={dashboard.application.zoneDistribution} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Gender</CardTitle></CardHeader>
            <CardContent><RecordList record={dashboard.application.genderDistribution} /></CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Review Analytics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Reviewers assigned" value={dashboard.review.reviewersAssignedCount} />
          <MetricCard label="Unassigned applications" value={dashboard.review.unassignedApplications} />
          <MetricCard label="Not started" value={dashboard.review.reviewsNotStarted} />
          <MetricCard label="In progress" value={dashboard.review.reviewsInProgress} />
          <MetricCard label="Submitted" value={dashboard.review.reviewsSubmitted} />
          <MetricCard label="Avg. completion (minutes)" value={dashboard.review.averageCompletionMinutes ?? "—"} />
          <MetricCard label="Reviewer score average" value={dashboard.review.reviewerScoreAverage ?? "—"} />
          <MetricCard label="Score variance" value={dashboard.review.scoreVariance ?? "—"} />
          <MetricCard label="Third-review triggers" value={dashboard.review.thirdReviewTriggers} />
          <MetricCard label="Reviewer conflicts" value={dashboard.review.reviewerConflicts} />
          <MetricCard label="Shortlisted" value={dashboard.review.shortlistTotals.shortlisted} />
          <MetricCard label="Reserve" value={dashboard.review.shortlistTotals.reserve} />
          <MetricCard label="Not shortlisted" value={dashboard.review.shortlistTotals.notShortlisted} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Interview Analytics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Applicants shortlisted" value={dashboard.interview.applicantsShortlisted} />
          <MetricCard label="Scheduled" value={dashboard.interview.interviewsScheduled} />
          <MetricCard label="Completed" value={dashboard.interview.interviewsCompleted} />
          <MetricCard label="Rescheduled" value={dashboard.interview.interviewsRescheduled} />
          <MetricCard label="Cancelled" value={dashboard.interview.interviewsCancelled} />
          <MetricCard label="Absent" value={dashboard.interview.applicantsAbsent} />
          <MetricCard label="Technical issues" value={dashboard.interview.technicalIssues} />
          <MetricCard label="Panel-assignment completion" value={`${dashboard.interview.panelAssignmentCompletionPercent}%`} />
          <MetricCard label="Score-submission completion" value={`${dashboard.interview.panellistScoreSubmissionCompletionPercent}%`} />
          <MetricCard label="Average interview score" value={dashboard.interview.averageInterviewScore ?? "—"} />
          <MetricCard label="Invitations sent" value={dashboard.interview.invitationsSent} />
          <MetricCard label="Reminders due/sent" value={dashboard.interview.remindersScheduledOrDue} />
        </div>
        <div className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Interview decision bands</CardTitle></CardHeader>
            <CardContent><RecordList record={dashboard.interview.decisionBands} /></CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Final Ranking Analytics</h2>
        {!dashboard.ranking.hasSnapshot ? (
          <p className="text-muted-foreground text-sm">No ranking generated yet for this cohort.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Top 70" value={dashboard.ranking.top70Count} />
              <MetricCard label="Top 60" value={dashboard.ranking.top60Count} />
              <MetricCard label="Final 30" value={dashboard.ranking.final30Count} hint={`cohort target`} />
              <MetricCard label="Ties" value={dashboard.ranking.tieCount} />
              <MetricCard label="Tie-break decisions" value={dashboard.ranking.tieBreakDecisionsCount} />
              <MetricCard label="Ranking versions" value={dashboard.ranking.rankingVersions} />
              <MetricCard label="Approval stages completed" value={`${dashboard.ranking.approvalStagesCompleted} / 4`} />
              <MetricCard label="Approved vs. provisional" value={dashboard.ranking.isApproved ? "Approved" : "Provisional"} />
            </div>
            <div className="mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Final-score distribution</CardTitle></CardHeader>
                <CardContent><RecordList record={dashboard.ranking.finalScoreDistribution} /></CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Admission and Offer Analytics</h2>
        <p className="text-muted-foreground mb-3 text-sm">
          The Admissions/Offers module hasn&apos;t been built yet — these figures are real queries against real tables and will
          honestly stay at zero until that module exists to write to them.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Offers issued" value={dashboard.admission.offersIssued} />
          <MetricCard label="Accepted" value={dashboard.admission.offersAccepted} />
          <MetricCard label="Declined" value={dashboard.admission.offersDeclined} />
          <MetricCard label="Pending" value={dashboard.admission.offersPending} />
          <MetricCard label="Lapsed" value={dashboard.admission.offersLapsed} />
          <MetricCard label="Reserve promoted" value={dashboard.admission.reserveCandidatesPromoted} />
          <MetricCard label="Remaining capacity" value={dashboard.admission.remainingCohortCapacity ?? "—"} />
          <MetricCard label="Acceptance rate" value={`${dashboard.admission.acceptanceRatePercent}%`} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Notification Analytics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Generated" value={dashboard.notification.notificationsGenerated} />
          <MetricCard label="Sent" value={dashboard.notification.notificationsSent} />
          <MetricCard label="Failed" value={dashboard.notification.notificationsFailed} />
          <MetricCard label="Retry success rate" value={`${dashboard.notification.retrySuccessPercent}%`} />
          <MetricCard label="Reminder delivery completion" value={`${dashboard.notification.reminderDeliveryCompletionPercent}%`} />
          <MetricCard label="Applicants without valid email" value={dashboard.notification.applicantsWithoutValidEmail} />
        </div>
        <div className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Delivery by event type</CardTitle></CardHeader>
            <CardContent><RecordList record={dashboard.notification.deliveryByEventType} /></CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
