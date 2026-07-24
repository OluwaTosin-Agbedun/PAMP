"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import {
  createEligibilityRecommendationAction,
  dismissEligibilityRecommendationAction,
  executeEligibilityOverrideAction,
} from "./actions";

export type RecommendationViewModel = {
  id: string;
  currentIsEligible: boolean;
  recommendedIsEligible: boolean;
  reason: string;
  status: "PENDING" | "EXECUTED" | "DISMISSED";
  raisedByName: string;
  createdAt: string;
  executedByName: string | null;
  executionNote: string | null;
};

const STATUS_VARIANT: Record<RecommendationViewModel["status"], "outline" | "default" | "secondary"> = {
  PENDING: "outline",
  EXECUTED: "default",
  DISMISSED: "secondary",
};

/**
 * Release 1.5 §"Governance Resolution" — this is the one screen both
 * halves of the Eligibility QA workflow share: an Eligibility Reviewer
 * flags a case here (canRecommend); a Programme Secretariat account
 * executes or dismisses a pending flag here (canExecute). Neither
 * capability lets either role edit `Application.eligibilityStatus`
 * directly — only `executeEligibilityOverrideAction` does that, and only
 * for someone with `eligibility_override.execute`.
 */
export function EligibilityQaCard({
  applicationId,
  recommendations,
  canRecommend,
  canExecute,
  hasDecision,
}: {
  applicationId: string;
  recommendations: RecommendationViewModel[];
  canRecommend: boolean;
  canExecute: boolean;
  hasDecision: boolean;
}) {
  if (!canRecommend && !canExecute && recommendations.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Eligibility QA</CardTitle>
        <CardDescription>
          A flagged automated outcome and a recommended result — never a direct edit. Only a Programme Secretariat
          account can execute an approved override.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {recommendations.length === 0 ? (
          <p className="text-muted-foreground text-sm">No recommendations recorded.</p>
        ) : (
          <ul className="grid gap-3">
            {recommendations.map((r, index) => (
              <li key={r.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {r.currentIsEligible ? "Eligible" : "Ineligible"} → recommend {r.recommendedIsEligible ? "Eligible" : "Ineligible"}
                  </p>
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  Raised by {r.raisedByName} · {new Date(r.createdAt).toLocaleString("en-GB")}
                </p>
                <p className="mt-1 text-sm">{r.reason}</p>
                {r.executedByName && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Resolved by {r.executedByName}
                    {r.executionNote ? ` — ${r.executionNote}` : ""}
                  </p>
                )}
                {canExecute && r.status === "PENDING" && <ResolveRow applicationId={applicationId} recommendationId={r.id} />}
                {index < recommendations.length - 1 && <Separator className="mt-3" />}
              </li>
            ))}
          </ul>
        )}

        {canRecommend && hasDecision && (
          <>
            <Separator />
            <RecommendForm applicationId={applicationId} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendForm({ applicationId }: { applicationId: string }) {
  const [recommendedIsEligible, setRecommendedIsEligible] = useState("false");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createEligibilityRecommendationAction(applicationId, {
        recommendedIsEligible: recommendedIsEligible === "true",
        reason,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setReason("");
      toast.success("Recommendation submitted.");
    });
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">Flag this outcome</p>
      <div className="grid gap-2">
        <Label htmlFor="recommended-outcome">Recommended outcome</Label>
        <Select value={recommendedIsEligible} onValueChange={setRecommendedIsEligible}>
          <SelectTrigger id="recommended-outcome">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Eligible</SelectItem>
            <SelectItem value="false">Ineligible</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="recommendation-reason">Reason</Label>
        <Textarea id="recommendation-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this case should be reviewed…" />
      </div>
      <Button size="sm" onClick={submit} disabled={isPending || reason.trim().length < 10}>
        {isPending ? "Submitting…" : "Submit recommendation"}
      </Button>
    </div>
  );
}

function ResolveRow({ applicationId, recommendationId }: { applicationId: string; recommendationId: string }) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function execute() {
    startTransition(async () => {
      const result = await executeEligibilityOverrideAction(applicationId, { recommendationId, executionNote: note || undefined });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Override executed.");
    });
  }

  function dismiss() {
    startTransition(async () => {
      const result = await dismissEligibilityRecommendationAction(applicationId, { recommendationId, executionNote: note || undefined });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Recommendation dismissed.");
    });
  }

  return (
    <div className="mt-2 grid gap-2">
      <Textarea placeholder="Optional note…" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
      <div className="flex gap-2">
        <Button size="sm" onClick={execute} disabled={isPending}>
          Execute override
        </Button>
        <Button size="sm" variant="outline" onClick={dismiss} disabled={isPending}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
