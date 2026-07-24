import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { getInterviewScoreOverviewForSecretariat } from "@/modules/interviews/services/interviewScoreService";

import { CloseOverrideForm } from "./close-override-form";

export const metadata: Metadata = {
  title: "Interview scoring oversight — PAM-P FMS",
};

const COMMENT_FIELDS: { key: "overallAssessment" | "strengths" | "concerns"; label: string }[] = [
  { key: "overallAssessment", label: "Overall assessment" },
  { key: "strengths", label: "Strengths" },
  { key: "concerns", label: "Concerns" },
];

// PAM-P 2026 Interview Score Sheet — matches scoring-form.tsx's RECOMMENDATION_OPTIONS.
const RECOMMENDATION_LABELS: Record<string, string> = {
  STRONGLY_RECOMMEND: "Strongly Recommend",
  RECOMMEND: "Recommend",
  RESERVE: "Reserve",
  NOT_RECOMMENDED: "Not Recommended",
  INTEGRITY_HOLD: "Integrity Hold",
};

export default async function InterviewScoringOversightPage({ params }: { params: Promise<{ interviewId: string }> }) {
  const user = await requirePagePermission(PERMISSIONS.INTERVIEW_SCORES_VIEW_ALL);
  const { interviewId } = await params;

  let overview;
  try {
    overview = await getInterviewScoreOverviewForSecretariat(user.id, interviewId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { interview, scores, applicationScore, activePanelists, threshold, askedQuestions } = overview;
  const applicant = interview.application.applicant;
  const applicantName = `${applicant.firstName} ${applicant.lastName}`;

  const canCloseOverride = permissionsForRole(user.role).includes(PERMISSIONS.INTERVIEW_SCORING_CLOSE_OVERRIDE);
  const panelistNameById = new Map(activePanelists.map((p) => [p.userId, p.user.name]));
  const missingPanelistName =
    threshold.missingPanelistId !== null ? (panelistNameById.get(threshold.missingPanelistId) ?? "This panellist") : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/interviews/scheduling" className="text-muted-foreground text-sm hover:underline">
          ← Back to Interview Scheduling
        </Link>
        {interview.scoringOverrideAt && <Badge variant="destructive">Closed with Secretariat override</Badge>}
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{applicantName}</h1>
        <p className="text-muted-foreground text-sm">
          {threshold.submittedCount} of {threshold.activeCount} panellists have submitted.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Panel scores</CardTitle>
          <CardDescription>
            Every panellist&apos;s score and comments, shown for oversight — panellists themselves never see this
            page or each other&apos;s work.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {scores.length === 0 ? (
            <p className="text-muted-foreground text-sm">No panellist has started scoring yet.</p>
          ) : (
            scores.map((s, index) => (
              <div key={s.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {s.panelist.name}
                    {s.integrityFlag && (
                      <Badge variant="destructive" className="ml-2">
                        Integrity flag
                      </Badge>
                    )}
                  </p>
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">{s.status}</p>
                    <p className="text-sm font-semibold">{s.totalScore?.toString() ?? "—"}</p>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {COMMENT_FIELDS.map(({ key, label }) =>
                    s[key] ? (
                      <div key={key}>
                        <p className="text-muted-foreground text-xs">{label}</p>
                        <p className="text-sm whitespace-pre-wrap">{s[key]}</p>
                      </div>
                    ) : null,
                  )}
                  {s.recommendation && (
                    <div>
                      <p className="text-muted-foreground text-xs">Recommendation</p>
                      <p className="text-sm">{RECOMMENDATION_LABELS[s.recommendation] ?? s.recommendation}</p>
                    </div>
                  )}
                </div>
                {index < scores.length - 1 && <Separator className="mt-4" />}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Questions asked</CardTitle>
          <CardDescription>
            {interview.actualStartedAt
              ? `Started ${new Date(interview.actualStartedAt).toLocaleString("en-GB")}${interview.actualEndedAt ? `, ended ${new Date(interview.actualEndedAt).toLocaleString("en-GB")}` : ""}.`
              : "The interview session hasn't started yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {askedQuestions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No questions recorded yet.</p>
          ) : (
            <ul className="grid gap-2">
              {askedQuestions.map((a) => (
                <li key={a.id} className="text-sm">
                  <Badge variant="outline" className="mr-2">
                    {a.question.category.replaceAll("_", " ")}
                  </Badge>
                  {a.question.text}
                  <span className="text-muted-foreground block text-xs">
                    Selected by {a.askedByPanelist.name} · {new Date(a.askedAt).toLocaleString("en-GB")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {applicationScore?.interviewAverage !== null && applicationScore?.interviewAverage !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle>Panel average: {applicationScore.interviewAverage.toString()}</CardTitle>
            <CardDescription>Based on {applicationScore.interviewScoreCount} valid submission(s).</CardDescription>
          </CardHeader>
        </Card>
      )}

      {canCloseOverride && !interview.scoringOverrideAt && threshold.status === "OVERRIDE_ELIGIBLE" && missingPanelistName && (
        <Card>
          <CardHeader>
            <CardTitle>Close interview with three valid scores</CardTitle>
          </CardHeader>
          <CardContent>
            <CloseOverrideForm interviewId={interview.id} missingPanelistName={missingPanelistName} />
          </CardContent>
        </Card>
      )}

      {interview.scoringOverrideAt && (
        <Card>
          <CardHeader>
            <CardTitle>Override details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p>
              <span className="text-muted-foreground">Closed:</span> {new Date(interview.scoringOverrideAt).toLocaleString("en-GB")}
            </p>
            <p>
              <span className="text-muted-foreground">Reason:</span> {interview.scoringOverrideReason}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
