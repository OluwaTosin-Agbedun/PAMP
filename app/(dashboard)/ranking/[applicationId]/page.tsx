import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { getCandidateRankingDetail } from "@/modules/ranking/services/rankingWorkspaceService";

import { DECISION_BAND_LABELS, INELIGIBILITY_LABELS } from "../types";

export const metadata: Metadata = {
  title: "Candidate Ranking — PAM-P FMS",
};

export default async function CandidateRankingDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const currentUser = await requirePagePermission(PERMISSIONS.RANKING_VIEW);
  const { applicationId } = await params;

  let detail;
  try {
    detail = await getCandidateRankingDetail(currentUser.id, applicationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const applicant = detail.application.applicant;

  return (
    <div className="grid gap-6">
      <Link href="/ranking" className="text-muted-foreground text-sm hover:underline">
        ← Back to Final Ranking
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {applicant.firstName} {applicant.lastName}
          </h1>
          <p className="text-muted-foreground text-sm">
            {detail.application.pathway ?? "No pathway selected"}
            {applicant.stateOfOrigin ? ` — ${applicant.stateOfOrigin}` : ""}
          </p>
        </div>
        <Link href={`/applicants/${applicationId}`} className="text-primary text-sm hover:underline">
          View full applicant record
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking eligibility</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.eligibility.eligible ? (
            <Badge>Eligible for ranking</Badge>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Not yet eligible</Badge>
              <span className="text-muted-foreground text-sm">{INELIGIBILITY_LABELS[detail.eligibility.reason]}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Final score calculation</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground text-xs">Application Review (/60)</dt>
              <dd className="text-lg font-medium">{detail.application.applicationScore?.reviewAverage?.toString() ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Interview (/40)</dt>
              <dd className="text-lg font-medium">{detail.application.applicationScore?.interviewAverage?.toString() ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Final Score (/100)</dt>
              <dd className="text-lg font-medium">{detail.compositeScore?.toString() ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Decision Band</dt>
              <dd>{detail.decisionBand ? <Badge variant="secondary">{DECISION_BAND_LABELS[detail.decisionBand]}</Badge> : "—"}</dd>
            </div>
          </dl>
          <p className="text-muted-foreground mt-3 text-xs">
            Calculated automatically from the review and interview averages — never manually editable. Detailed reviewer
            score breakdowns and panellist comments remain available to authorised roles via the Application Review and
            Interview Workspaces.
          </p>
        </CardContent>
      </Card>

      {detail.snapshot && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Final Ranking</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              Status: <Badge variant={detail.snapshot.isLocked ? "default" : "outline"}>{detail.snapshot.isLocked ? "Approved" : "Provisional"}</Badge>
            </p>
            <p>Generated {new Date(detail.snapshot.generatedAt).toLocaleString("en-GB")}</p>
            {detail.snapshotEntry ? (
              <p>
                Rank {detail.snapshotEntry.rank} of the ranked cohort (final cohort size {detail.snapshot.targetSize}) — score
                at generation: {detail.snapshotEntry.score.toString()}
              </p>
            ) : (
              <p className="text-muted-foreground">Not included in the current ranking.</p>
            )}
          </CardContent>
        </Card>
      )}

      {detail.tieResolution && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Level 3 tie</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <Badge variant={detail.tieResolution.status === "PENDING" ? "destructive" : "outline"}>
              {detail.tieResolution.status === "PENDING" ? "Resolution required" : "Resolved"}
            </Badge>
            {detail.tieResolution.justification && (
              <p className="text-muted-foreground mt-2">{detail.tieResolution.justification}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
