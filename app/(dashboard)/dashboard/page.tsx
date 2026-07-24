import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveCohort } from "@/lib/cohort";
import { navGroupsForRole } from "@/lib/navigation";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requireUser } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { ROLE_LABELS } from "@/lib/rbac/roles";
import { getApplicantSummaryCounts } from "@/modules/applicants/repository";
import { getInterviewDashboardSummary } from "@/modules/interviews/services/interviewDashboardService";
import { getReviewOperationsDashboard } from "@/modules/reviewOperations/services/dashboardService";
import { getRankingWorkspace } from "@/modules/ranking/services/rankingWorkspaceService";

export const metadata: Metadata = {
  title: "Dashboard — PAM-P FMS",
};

function StatCard({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const content = (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="transition-opacity hover:opacity-80">
      {content}
    </Link>
  ) : (
    content
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const granted = permissionsForRole(user.role);
  const items = navGroupsForRole(user.role).flatMap((group) => group.items);

  const canViewApplicants = granted.includes(PERMISSIONS.APPLICATIONS_VIEW);
  const canViewReviewOperations = granted.includes(PERMISSIONS.REVIEW_OPERATIONS_VIEW);
  const canViewInterviewOperations = granted.includes(PERMISSIONS.INTERVIEW_OPERATIONS_VIEW);
  const canViewRanking = granted.includes(PERMISSIONS.RANKING_VIEW);

  // A brand-new deployment with no active cohort yet shouldn't fail the
  // whole dashboard render — every stats section below is opt-in per
  // permission already, and none of them mean anything without a cohort.
  let cohort: Awaited<ReturnType<typeof getActiveCohort>> | null = null;
  if (canViewApplicants || canViewReviewOperations || canViewInterviewOperations || canViewRanking) {
    try {
      cohort = await getActiveCohort();
    } catch {
      cohort = null;
    }
  }

  const [applicantSummary, reviewOperations, interviews, ranking] = await Promise.all([
    canViewApplicants && cohort ? getApplicantSummaryCounts(cohort.id) : null,
    canViewReviewOperations && cohort ? getReviewOperationsDashboard(user.id, cohort.programmeId, cohort.id) : null,
    canViewInterviewOperations && cohort ? getInterviewDashboardSummary(user.id, cohort.id) : null,
    canViewRanking && cohort ? getRankingWorkspace(user.id, cohort.id) : null,
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {user.name?.split(" ")[0] ?? "there"}
          </h1>
          <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          PAM-P Fellowship Management System — {cohort ? `${cohort.name} cycle` : "no active cohort configured"}.
        </p>
      </div>

      {applicantSummary && (
        <div className="grid gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Applicants</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total imported" value={applicantSummary.total} href="/applicants" />
            <StatCard label="Eligible" value={applicantSummary.eligible} href="/applicants?eligibilityStatus=ELIGIBLE" />
            <StatCard label="Pending" value={applicantSummary.pending} href="/applicants?eligibilityStatus=PENDING" />
            <StatCard label="Ineligible" value={applicantSummary.ineligible} href="/applicants?eligibilityStatus=INELIGIBLE" />
          </div>
        </div>
      )}

      {reviewOperations && (
        <div className="grid gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Application Review</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Awaiting assignment" value={reviewOperations.applicationsAwaitingAssignment} href="/review-operations/assignments" />
            <StatCard label="In progress" value={reviewOperations.reviewsInProgress} href="/review-operations/assignments" />
            <StatCard label="Submitted" value={reviewOperations.reviewsSubmitted} href="/review-operations/assignments" />
            <StatCard label="Overdue" value={reviewOperations.reviewsOverdue} href="/review-operations/risk" />
          </div>
        </div>
      )}

      {interviews && (
        <div className="grid gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Interviews</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Awaiting booking" value={interviews.awaitingBooking} href="/interviews/scheduling" />
            <StatCard label="Scheduled" value={interviews.scheduled} href="/interviews/scheduling" />
            <StatCard label="Completed" value={interviews.completed} href="/interviews" />
            <StatCard label="Cancelled / No-show" value={interviews.cancelledOrNoShow} href="/interviews/scheduling" />
          </div>
        </div>
      )}

      {canViewRanking && (
        <div className="grid gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Final Ranking</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Status"
              value={!ranking?.snapshot ? "Not generated" : ranking.snapshot.isLocked ? "Approved" : "Provisional"}
              href="/ranking"
            />
            <StatCard label="Ranked" value={ranking?.entries.length ?? 0} href="/ranking" />
            <StatCard label="Not yet eligible" value={ranking?.excluded.length ?? 0} href="/ranking" />
            <StatCard
              label="Ties needing resolution"
              value={ranking?.tieResolutions.filter((t) => t.status === "PENDING").length ?? 0}
              href="/ranking"
            />
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Workspaces</h2>
        {items.length > 0 ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <Card className="transition-colors hover:bg-accent/50">
                    <CardHeader>
                      <Icon className="text-muted-foreground size-5" />
                      <CardTitle className="text-base">{item.label}</CardTitle>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="mt-3">
            <CardHeader>
              <CardTitle>No workspaces assigned yet</CardTitle>
              <CardDescription>
                Your account doesn&apos;t have access to any workspace. Contact your System
                Administrator if this looks wrong.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
