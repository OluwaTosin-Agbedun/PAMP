import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ReviewStatus } from "@/lib/generated/prisma/client";

import type { CriterionViewModel } from "./types";

const STATUS_LABELS: Partial<Record<ReviewStatus, string>> = {
  SUBMITTED: "Submitted",
  RECUSED: "Recused",
  CANCELLED: "Cancelled",
};

/** Read-only — a submitted, recused, or cancelled review has nothing left to edit (§13 locking). */
export function ReviewSummary({
  applicantName,
  status,
  comments,
  submittedAt,
  total,
  maxPossible,
  criteria,
  breakdown,
}: {
  applicantName: string;
  status: ReviewStatus;
  comments: string | null;
  submittedAt: string | null;
  total: string;
  maxPossible: string;
  criteria: CriterionViewModel[];
  breakdown: { criterionId: string; rawScore: string | null; comment: string | null }[];
}) {
  const breakdownByCriterion = new Map(breakdown.map((b) => [b.criterionId, b]));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{applicantName}</h1>
        <Badge variant={status === "SUBMITTED" ? "default" : "destructive"}>
          {STATUS_LABELS[status] ?? status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Total score: {total} / {maxPossible}
          </CardTitle>
          <CardDescription>
            {submittedAt ? `Submitted ${new Date(submittedAt).toLocaleString("en-GB")}` : "Not submitted"} — this
            review is locked and can no longer be edited.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scores</CardTitle>
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
                {entry?.comment && <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{entry.comment}</p>}
                {index < criteria.length - 1 && <Separator className="mt-4" />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {comments && (
        <Card>
          <CardHeader>
            <CardTitle>Overall comments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{comments}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
