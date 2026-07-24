"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { endInterviewSessionAction, selectAdditionalQuestionAction, startInterviewSessionAction } from "./actions";
import type { QuestionFrameworkViewModel } from "./types";

const CATEGORY_LABELS: Record<string, string> = {
  MANDATORY: "Mandatory",
  PATHWAY: "Pathway",
  SITUATIONAL: "Situational",
  ADDITIONAL_BANK: "Additional",
};

/** Addendum §3 — the shared question session every active panellist can operate (no chair-only restriction). */
export function InterviewQuestionsPanel({ interviewId, framework }: { interviewId: string; framework: QuestionFrameworkViewModel }) {
  const router = useRouter();
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const started = framework.actualStartedAt !== null;
  const ended = framework.actualEndedAt !== null;

  function handleStart() {
    setError(undefined);
    startTransition(async () => {
      const result = await startInterviewSessionAction(interviewId);
      if ("error" in result) {
        setError(result.error);
        toast.error("Couldn't start the interview.", { description: result.error });
        return;
      }
      toast.success("Interview started.");
      router.refresh();
    });
  }

  function handleEnd() {
    setError(undefined);
    startTransition(async () => {
      const result = await endInterviewSessionAction(interviewId);
      if ("error" in result) {
        setError(result.error);
        toast.error("Couldn't end the interview.", { description: result.error });
        return;
      }
      toast.success("Interview ended.");
      router.refresh();
    });
  }

  function handleAddAdditional() {
    if (!selectedQuestionId) return;
    setError(undefined);
    startTransition(async () => {
      const result = await selectAdditionalQuestionAction({ interviewId, questionId: selectedQuestionId });
      if ("error" in result) {
        setError(result.error);
        toast.error("Couldn't add that question.", { description: result.error });
        return;
      }
      setSelectedQuestionId("");
      toast.success("Question added.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Interview questions</CardTitle>
          {ended ? (
            <Badge variant="outline">Session ended</Badge>
          ) : started ? (
            <Badge>Session in progress</Badge>
          ) : (
            <Badge variant="outline">Not started</Badge>
          )}
        </div>
        <CardDescription>
          {ended
            ? `Started ${new Date(framework.actualStartedAt!).toLocaleString("en-GB")}, ended ${new Date(framework.actualEndedAt!).toLocaleString("en-GB")}.`
            : started
              ? `Started ${new Date(framework.actualStartedAt!).toLocaleString("en-GB")}. Mandatory and matching pathway questions are already recorded — add any additional questions from the bank below.`
              : "Starting the interview automatically records every mandatory question and any pathway question matching this applicant."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}

        {!started && (
          <div className="grid gap-3">
            {framework.autoAsked.length === 0 ? (
              <p className="text-muted-foreground text-sm">No mandatory or pathway questions configured yet.</p>
            ) : (
              <ul className="grid gap-2">
                {framework.autoAsked.map((q) => (
                  <li key={q.id} className="text-sm">
                    <Badge variant="outline" className="mr-2">
                      {CATEGORY_LABELS[q.category]}
                    </Badge>
                    {q.text}
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={handleStart} disabled={isPending} className="justify-self-start">
              {isPending ? "Starting…" : "Start interview"}
            </Button>
          </div>
        )}

        {(started || ended) && (
          <div className="grid gap-4">
            {framework.asked.length === 0 ? (
              <p className="text-muted-foreground text-sm">No questions recorded yet.</p>
            ) : (
              <ul className="grid gap-2">
                {framework.asked.map((a) => (
                  <li key={a.id} className="text-sm">
                    <Badge variant="outline" className="mr-2">
                      {CATEGORY_LABELS[a.category]}
                    </Badge>
                    {a.text}
                    <span className="text-muted-foreground block text-xs">
                      Selected by {a.askedByName} · {new Date(a.askedAt).toLocaleString("en-GB")}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {started && !ended && (
              <>
                {framework.availableAdditional.length > 0 && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select value={selectedQuestionId} onValueChange={setSelectedQuestionId}>
                      <SelectTrigger className="w-full sm:max-w-sm">
                        <SelectValue placeholder="Add an additional question…" />
                      </SelectTrigger>
                      <SelectContent>
                        {framework.availableAdditional.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.text}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAddAdditional} disabled={isPending || !selectedQuestionId} variant="outline">
                      Add
                    </Button>
                  </div>
                )}
                <Button onClick={handleEnd} disabled={isPending} variant="outline" className="justify-self-start">
                  {isPending ? "Ending…" : "End interview"}
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
