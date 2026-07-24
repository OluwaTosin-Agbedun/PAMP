import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ScoreSubmissionStatus } from "@/lib/generated/prisma/client";

import type { CriterionViewModel, InterviewCommentsViewModel } from "./types";

const STATUS_LABELS: Partial<Record<ScoreSubmissionStatus, string>> = {
  SUBMITTED: "Submitted",
  RECUSED: "Recused",
};

const COMMENT_FIELDS: { key: "overallAssessment" | "strengths" | "concerns"; label: string }[] = [
  { key: "overallAssessment", label: "Overall assessment" },
  { key: "strengths", label: "Strengths" },
  { key: "concerns", label: "Concerns" },
];

// PAM-P 2026 Interview Score Sheet — matches the labels in scoring-form.tsx's RECOMMENDATION_OPTIONS.
const RECOMMENDATION_LABELS: Record<string, string> = {
  STRONGLY_RECOMMEND: "Strongly Recommend",
  RECOMMEND: "Recommend",
  RESERVE: "Reserve",
  NOT_RECOMMENDED: "Not Recommended",
  INTEGRITY_HOLD: "Integrity Hold",
};

/** Read-only — a submitted or recused interview score has nothing left to edit. */
export function InterviewSummary({
  applicantName,
  status,
  comments,
  submittedAt,
  total,
  maxPossible,
  criteria,
  breakdown,
  submittedCount,
  totalPanelists,
  scoringClosed,
  interviewAverage,
}: {
  applicantName: string;
  status: ScoreSubmissionStatus;
  comments: InterviewCommentsViewModel;
  submittedAt: string | null;
  total: string;
  maxPossible: string;
  criteria: CriterionViewModel[];
  breakdown: { criterionId: string; rawScore: string | null }[];
  submittedCount: number;
  totalPanelists: number;
  scoringClosed: boolean;
  interviewAverage: string | null;
}) {
  const breakdownByCriterion = new Map(breakdown.map((b) => [b.criterionId, b]));
  const hasAnyComment = COMMENT_FIELDS.some(({ key }) => comments[key]) || comments.recommendation !== null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{applicantName}</h1>
        <Badge variant={status === "SUBMITTED" ? "default" : "destructive"}>{STATUS_LABELS[status] ?? status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Your score: {total} / {maxPossible}
          </CardTitle>
          <CardDescription>
            {submittedAt ? `Submitted ${new Date(submittedAt).toLocaleString("en-GB")}` : "Not submitted"} — this score is
            locked and can no longer be edited.{" "}
            {scoringClosed
              ? "This interview was closed by the Programme Secretariat."
              : submittedCount < totalPanelists
                ? `Waiting on ${totalPanelists - submittedCount} of ${totalPanelists} panellists before scores are revealed to the full panel.`
                : "Every panellist has submitted."}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your scores</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {criteria.map((criterion, index) => {
            const entry = breakdownByCriterion.get(criterion.id);
            return (
              <div key={criterion.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">{criterion.label}</p>
                  <p className="text-sm font-semibold">
                    {entry?.rawScore ?? "—"} / {criterion.maxScore}
                  </p>
                </div>
                {index < criteria.length - 1 && <Separator className="mt-4" />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {hasAnyComment && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Panel comments</CardTitle>
              {comments.integrityFlag && <Badge variant="destructive">Integrity flag raised</Badge>}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {COMMENT_FIELDS.map(({ key, label }) =>
              comments[key] ? (
                <div key={key}>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-sm whitespace-pre-wrap">{comments[key]}</p>
                  <Separator className="mt-4" />
                </div>
              ) : null,
            )}
            {comments.recommendation && (
              <div>
                <p className="text-sm font-medium">Recommendation</p>
                <p className="text-sm">{RECOMMENDATION_LABELS[comments.recommendation] ?? comments.recommendation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {interviewAverage !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Panel average: {interviewAverage} / {maxPossible}</CardTitle>
            <CardDescription>
              {scoringClosed
                ? "The Programme Secretariat closed this interview with three valid scores."
                : "Every panellist has submitted."}{" "}
              Individual panellists&apos; scores and comments remain private to them.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
