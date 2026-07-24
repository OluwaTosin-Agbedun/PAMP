"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { resolveTieAction } from "./actions";
import type { TieResolutionViewModel } from "./types";

/**
 * Addendum Module 5, Tie Level 3: "Final Selection Committee reviews...
 * Committee records mandatory justification." Two or more applications
 * matched exactly on both interview score and application review score
 * — this is the Committee's own decision, not an automatic resolution,
 * so the form requires an explicit distinct order plus a justification
 * before it will submit.
 */
export function TieResolutionCard({ tie, canResolve }: { tie: TieResolutionViewModel; canResolve: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ranks, setRanks] = useState<Record<string, string>>(
    Object.fromEntries(tie.applications.map((a) => [a.applicationId, ""])),
  );
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | undefined>();

  const resolvedRanks = tie.applications.map((a) => ({
    applicationId: a.applicationId,
    resolvedRank: Number(ranks[a.applicationId]),
  }));
  const allRanksEntered = resolvedRanks.every((r) => Number.isInteger(r.resolvedRank) && r.resolvedRank > 0);
  const ranksAreDistinct = new Set(resolvedRanks.map((r) => r.resolvedRank)).size === resolvedRanks.length;

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const result = await resolveTieAction({ tieResolutionId: tie.id, justification, resolvedRanks });
      if ("error" in result) {
        setError(result.error);
        toast.error("Could not resolve tie.", { description: result.error });
        return;
      }
      toast.success("Tie resolved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Level 3 tie — score {tie.score}</CardTitle>
          <Badge variant={tie.status === "PENDING" ? "destructive" : "outline"}>
            {tie.status === "PENDING" ? "Resolution required" : "Resolved"}
          </Badge>
        </div>
        <CardDescription>
          {tie.applications.length} applications matched exactly on both interview score and application review score.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-2">
          {tie.applications.map((application) => (
            <li key={application.applicationId} className="flex items-center gap-3">
              <span className="flex-1 text-sm">{application.applicantName}</span>
              {tie.status === "PENDING" ? (
                <Input
                  type="number"
                  min={1}
                  className="w-24"
                  aria-label={`Resolved rank for ${application.applicantName}`}
                  value={ranks[application.applicationId]}
                  onChange={(e) => setRanks((prev) => ({ ...prev, [application.applicationId]: e.target.value }))}
                  disabled={!canResolve}
                />
              ) : (
                <span className="text-muted-foreground text-sm">Resolved rank: {application.resolvedRank ?? "—"}</span>
              )}
            </li>
          ))}
        </ul>

        {tie.status === "RESOLVED" ? (
          <div className="bg-muted rounded-md p-3 text-sm">
            <p className="font-medium">Justification</p>
            <p className="text-muted-foreground">{tie.justification}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Resolved by {tie.resolvedByName} on {tie.resolvedAt ? new Date(tie.resolvedAt).toLocaleString("en-GB") : "—"}
            </p>
          </div>
        ) : canResolve ? (
          <div className="grid gap-2">
            <Label htmlFor={`justification-${tie.id}`}>Justification</Label>
            <Textarea
              id={`justification-${tie.id}`}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              minLength={10}
              placeholder="Explain the committee's reasoning for this order (at least 10 characters)…"
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button
              type="button"
              className="w-fit"
              disabled={isPending || !allRanksEntered || !ranksAreDistinct || justification.trim().length < 10}
              onClick={handleSubmit}
            >
              {isPending ? "Recording…" : "Record resolution"}
            </Button>
            {allRanksEntered && !ranksAreDistinct && (
              <p className="text-destructive text-xs">Each application must receive a distinct rank.</p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Awaiting the Selection Committee&apos;s decision.</p>
        )}
      </CardContent>
    </Card>
  );
}
