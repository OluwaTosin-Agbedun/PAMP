"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { saveDraftInterviewScoresAction, submitInterviewScoreAction } from "./actions";
import type { InterviewCommentsViewModel, CriterionViewModel, InterviewRecommendationViewModel, ScoreViewModel } from "./types";

const AUTOSAVE_DELAY_MS = 1200;

type FreeTextCommentKey = "overallAssessment" | "strengths" | "concerns";

const COMMENT_FIELDS: { key: FreeTextCommentKey; label: string; placeholder: string }[] = [
  { key: "overallAssessment", label: "Overall assessment", placeholder: "Summarize your overall assessment of this candidate…" },
  { key: "strengths", label: "Strengths", placeholder: "What stood out positively?" },
  { key: "concerns", label: "Concerns", placeholder: "What gave you pause?" },
];

// PAM-P 2026 Interview Score Sheet — the closed recommendation checkbox row.
const RECOMMENDATION_OPTIONS: { value: InterviewRecommendationViewModel; label: string }[] = [
  { value: "STRONGLY_RECOMMEND", label: "Strongly Recommend" },
  { value: "RECOMMEND", label: "Recommend" },
  { value: "RESERVE", label: "Reserve" },
  { value: "NOT_RECOMMENDED", label: "Not Recommended" },
  { value: "INTEGRITY_HOLD", label: "Integrity Hold" },
];

export function InterviewScoringForm({
  interviewScoreId,
  criteria,
  initialScores,
  initialComments,
}: {
  interviewScoreId: string;
  criteria: CriterionViewModel[];
  initialScores: ScoreViewModel[];
  initialComments: InterviewCommentsViewModel;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const criterion of criteria) {
      const existing = initialScores.find((s) => s.criterionId === criterion.id);
      initial[criterion.id] = existing?.score ?? "";
    }
    return initial;
  });
  const [comments, setComments] = useState<Record<FreeTextCommentKey, string>>({
    overallAssessment: initialComments.overallAssessment ?? "",
    strengths: initialComments.strengths ?? "",
    concerns: initialComments.concerns ?? "",
  });
  const [recommendation, setRecommendation] = useState<InterviewRecommendationViewModel | "">(
    initialComments.recommendation ?? "",
  );
  const [integrityFlag, setIntegrityFlag] = useState(initialComments.integrityFlag);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scoredCount = criteria.filter((c) => scores[c.id]?.trim()).length;
  const progressPercent = criteria.length ? Math.round((scoredCount / criteria.length) * 100) : 0;

  const scoresPayload = useMemo(
    () =>
      Object.entries(scores)
        .filter(([, value]) => value.trim() !== "")
        .map(([criterionId, value]) => ({ criterionId, score: value.trim() })),
    [scores],
  );

  function scheduleAutosave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      const payload = Object.entries(scores)
        .filter(([, value]) => value.trim() !== "")
        .map(([criterionId, value]) => ({ criterionId, score: value.trim() }));
      if (payload.length === 0) return;

      setSaveState("saving");
      const result = await saveDraftInterviewScoresAction({ interviewScoreId, scores: payload });
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

  function updateScore(criterionId: string, value: string) {
    setScores((prev) => ({ ...prev, [criterionId]: value }));
    scheduleAutosave();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    startSubmitTransition(async () => {
      const result = await submitInterviewScoreAction({
        interviewScoreId,
        scores: scoresPayload,
        overallAssessment: comments.overallAssessment.trim() || null,
        strengths: comments.strengths.trim() || null,
        concerns: comments.concerns.trim() || null,
        recommendation: recommendation || null,
        integrityFlag,
      });
      if ("error" in result) {
        setSubmitError(result.error);
        toast.error("Couldn't submit this interview score.", { description: result.error });
        return;
      }
      toast.success("Interview score submitted.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Progress</CardTitle>
            <span aria-live="polite" className="text-muted-foreground text-xs">
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Draft saved"}
              {saveState === "error" && `Couldn't save: ${saveError}`}
            </span>
          </div>
          <CardDescription>
            {scoredCount} of {criteria.length} criteria scored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={progressPercent} label="Scoring progress" />
        </CardContent>
      </Card>

      {criteria.map((criterion) => {
        const scoreInputId = `score-${criterion.id}`;
        const guidanceId = `guidance-${criterion.id}`;
        return (
          <Card key={criterion.id}>
            <CardContent>
              <fieldset className="grid gap-3">
                <legend className="text-sm font-semibold">
                  {criterion.label}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">max {criterion.maxScore}</span>
                </legend>

                {criterion.description && (
                  <p id={guidanceId} className="text-muted-foreground text-sm">
                    {criterion.description}
                  </p>
                )}

                <div className="grid max-w-40 gap-2">
                  <Label htmlFor={scoreInputId}>Score</Label>
                  <Input
                    id={scoreInputId}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={criterion.maxScore}
                    step="0.01"
                    aria-describedby={criterion.description ? guidanceId : undefined}
                    value={scores[criterion.id] ?? ""}
                    onChange={(e) => updateScore(criterion.id, e.target.value)}
                  />
                </div>
              </fieldset>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Panel comments</CardTitle>
          <CardDescription>Your independent assessment — visible only to you until the panel&apos;s average is revealed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {COMMENT_FIELDS.map(({ key, label, placeholder }) => {
            const fieldId = `interview-${key}`;
            return (
              <div key={key} className="grid gap-2">
                <Label htmlFor={fieldId}>{label}</Label>
                <Textarea
                  id={fieldId}
                  value={comments[key]}
                  onChange={(e) => setComments((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                />
              </div>
            );
          })}

          <div className="grid gap-2">
            <Label htmlFor="interview-recommendation">Recommendation</Label>
            <Select value={recommendation} onValueChange={(value) => setRecommendation(value as InterviewRecommendationViewModel)}>
              <SelectTrigger id="interview-recommendation" className="w-full">
                <SelectValue placeholder="Select a recommendation…" />
              </SelectTrigger>
              <SelectContent>
                {RECOMMENDATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label htmlFor="interview-integrity-flag">Integrity flag</Label>
              <p className="text-muted-foreground text-xs">
                Flag a factual integrity concern — independent of your recommendation above.
              </p>
            </div>
            <Switch id="interview-integrity-flag" checked={integrityFlag} onCheckedChange={setIntegrityFlag} />
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          {submitError && <p className="text-destructive text-sm">{submitError}</p>}
          <Button type="submit" disabled={isSubmitting} className="sm:ml-auto">
            {isSubmitting ? "Submitting…" : "Submit interview score"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
