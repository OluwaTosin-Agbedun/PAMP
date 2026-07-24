"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

import { saveDraftScoresAction, submitReviewAction } from "./actions";
import type { CriterionViewModel, ScoreViewModel } from "./types";

const AUTOSAVE_DELAY_MS = 1200;

type FieldState = { score: string; comment: string };

function isCriterionRequired(criterion: CriterionViewModel, allCriteriaMandatory: boolean): boolean {
  return allCriteriaMandatory || criterion.isMandatory;
}

export function ScoringForm({
  reviewId,
  criteria,
  initialScores,
  initialComments,
  commentsRequired,
  allCriteriaMandatory,
}: {
  reviewId: string;
  criteria: CriterionViewModel[];
  initialScores: ScoreViewModel[];
  initialComments: string | null;
  commentsRequired: boolean;
  allCriteriaMandatory: boolean;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, FieldState>>(() => {
    const initial: Record<string, FieldState> = {};
    for (const criterion of criteria) {
      const existing = initialScores.find((s) => s.criterionId === criterion.id);
      initial[criterion.id] = { score: existing?.score ?? "", comment: existing?.comment ?? "" };
    }
    return initial;
  });
  const [overallComment, setOverallComment] = useState(initialComments ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requiredCriteria = useMemo(
    () => criteria.filter((c) => isCriterionRequired(c, allCriteriaMandatory)),
    [criteria, allCriteriaMandatory],
  );
  const completedRequiredCount = requiredCriteria.filter((c) => fields[c.id]?.score.trim()).length;
  const progressPercent = requiredCriteria.length
    ? Math.round((completedRequiredCount / requiredCriteria.length) * 100)
    : 100;

  function buildScoresPayload() {
    return Object.entries(fields)
      .filter(([, value]) => value.score.trim() !== "")
      .map(([criterionId, value]) => ({
        criterionId,
        score: value.score.trim(),
        comment: value.comment.trim() || null,
      }));
  }

  function scheduleAutosave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      const scores = buildScoresPayload();
      if (scores.length === 0) return;

      setSaveState("saving");
      const result = await saveDraftScoresAction({ reviewId, scores });
      if ("error" in result) {
        setSaveState("error");
        setSaveError(result.error);
        return;
      }
      setSaveState("saved");
      setSaveError(null);
    }, AUTOSAVE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  function updateField(criterionId: string, patch: Partial<FieldState>) {
    setFields((prev) => ({ ...prev, [criterionId]: { ...prev[criterionId], ...patch } }));
    scheduleAutosave();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    startSubmitTransition(async () => {
      const scores = buildScoresPayload();
      const result = await submitReviewAction({
        reviewId,
        scores,
        comments: overallComment.trim() || null,
      });
      if ("error" in result) {
        setSubmitError(result.error);
        toast.error("Couldn't submit this review.", { description: result.error });
        return;
      }
      toast.success("Review submitted.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Progress</CardTitle>
            <span
              aria-live="polite"
              className="text-muted-foreground text-xs"
            >
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Draft saved"}
              {saveState === "error" && `Couldn't save: ${saveError}`}
            </span>
          </div>
          <CardDescription>
            {completedRequiredCount} of {requiredCriteria.length} required criteria scored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={progressPercent} label="Scoring progress" />
        </CardContent>
      </Card>

      {criteria.map((criterion) => {
        const required = isCriterionRequired(criterion, allCriteriaMandatory);
        const field = fields[criterion.id] ?? { score: "", comment: "" };
        const scoreInputId = `score-${criterion.id}`;
        const commentId = `comment-${criterion.id}`;
        const guidanceId = `guidance-${criterion.id}`;

        return (
          <Card key={criterion.id}>
            <CardContent>
              <fieldset className="grid gap-3">
                <legend className="text-sm font-semibold">
                  {criterion.label}
                  {required && (
                    <span className="text-destructive ml-1" aria-hidden="true">
                      *
                    </span>
                  )}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    max {criterion.maxScore}
                  </span>
                </legend>

                {(criterion.reviewerGuidance || criterion.description) && (
                  <p id={guidanceId} className="text-muted-foreground text-sm">
                    {criterion.reviewerGuidance || criterion.description}
                  </p>
                )}

                {criterion.ratingScale ? (
                  <div className="grid gap-2" role="radiogroup" aria-required={required} aria-describedby={guidanceId}>
                    {criterion.ratingScale.bands.map((band) => {
                      const bandId = `${scoreInputId}-${band.value}`;
                      return (
                        <label
                          key={band.value}
                          htmlFor={bandId}
                          className="hover:bg-accent flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
                        >
                          <input
                            id={bandId}
                            type="radio"
                            name={scoreInputId}
                            value={band.value}
                            checked={field.score === band.value}
                            onChange={(e) => updateField(criterion.id, { score: e.target.value })}
                            className="mt-1"
                          />
                          <span>
                            <span className="font-medium">
                              {band.label} ({band.value})
                            </span>
                            {band.description && (
                              <span className="text-muted-foreground block text-xs">{band.description}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid max-w-40 gap-2">
                    <Label htmlFor={scoreInputId}>Score</Label>
                    <Input
                      id={scoreInputId}
                      type="number"
                      inputMode="decimal"
                      min={criterion.minScore}
                      max={criterion.maxScore}
                      step={criterion.allowDecimalScores ? "0.01" : "1"}
                      aria-required={required}
                      aria-describedby={guidanceId}
                      value={field.score}
                      onChange={(e) => updateField(criterion.id, { score: e.target.value })}
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor={commentId}>
                    Comment
                    {criterion.isCommentMandatory && (
                      <span className="text-destructive ml-1" aria-hidden="true">
                        *
                      </span>
                    )}
                  </Label>
                  <Textarea
                    id={commentId}
                    aria-required={criterion.isCommentMandatory}
                    value={field.comment}
                    onChange={(e) => updateField(criterion.id, { comment: e.target.value })}
                    placeholder="Evidence or reasoning for this score…"
                  />
                </div>
              </fieldset>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>
            Overall comments
            {commentsRequired && (
              <span className="text-destructive ml-1" aria-hidden="true">
                *
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="overall-comment" className="sr-only">
            Overall comments
          </Label>
          <Textarea
            id="overall-comment"
            aria-required={commentsRequired}
            value={overallComment}
            onChange={(e) => setOverallComment(e.target.value)}
            placeholder="Summarize your overall assessment of this application…"
          />
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          {submitError && <p className="text-destructive text-sm">{submitError}</p>}
          <Button type="submit" disabled={isSubmitting} className="sm:ml-auto">
            {isSubmitting ? "Submitting…" : "Submit review"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
