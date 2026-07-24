"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { recordApprovalStageDecisionAction } from "./actions";
import { APPROVAL_STAGE_LABELS, type ExecutiveDashboardViewModel } from "./types";

const STAGE_ORDER = ["TOP_70", "TOP_60", "FINAL_SELECTION", "VERIFICATION_CONFIRMATION"] as const;

/**
 * The Top 70 → Top 60 → Final Selection → Verification & Confirmation
 * sign-off — the workflow itself is server-authorised (`canDecideStage`,
 * `modules/executiveApproval`), so this component never disables an
 * action based on its own belief about what's allowed; it only follows
 * the server's `nextActionableStage` hint for which form to show, and
 * surfaces whatever the server actually rejects.
 */
export function ApprovalWorkflowCard({
  rankingSnapshotId,
  approval,
  canApprove,
}: {
  rankingSnapshotId: string;
  approval: NonNullable<ExecutiveDashboardViewModel["approval"]>;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | "">("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | undefined>();

  const stage = approval.nextActionableStage;
  const latestByStage = new Map(
    [...approval.stages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((row) => [row.stage, row]),
  );

  function handleSubmit() {
    if (!stage || !decision) return;
    setError(undefined);
    startTransition(async () => {
      const result = await recordApprovalStageDecisionAction({
        rankingSnapshotId,
        stage,
        decision,
        comment: comment.trim() || undefined,
      });
      if ("error" in result) {
        setError(result.error);
        toast.error("Could not record decision.", { description: result.error });
        return;
      }
      toast.success(`${APPROVAL_STAGE_LABELS[stage]} ${decision === "APPROVED" ? "approved" : "rejected"}.`);
      setDecision("");
      setComment("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Executive Approval Workflow</CardTitle>
        <CardDescription>Top 70 → Top 60 → Final Selection → Verification & Confirmation, each stage recorded with approver, decision, comment, and timestamp.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ol className="grid gap-2">
          {STAGE_ORDER.map((s) => {
            const row = latestByStage.get(s);
            const isNext = stage === s;
            return (
              <li key={s} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{APPROVAL_STAGE_LABELS[s]}</p>
                  {row ? (
                    <p className="text-muted-foreground text-xs">
                      {row.decision === "APPROVED" ? "Approved" : "Rejected"} by {row.approverName} on{" "}
                      {new Date(row.createdAt).toLocaleString("en-GB")}
                      {row.comment && ` — ${row.comment}`}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">Not yet decided.</p>
                  )}
                </div>
                <Badge
                  variant={
                    row?.decision === "APPROVED" ? "default" : row?.decision === "REJECTED" ? "destructive" : isNext ? "outline" : "secondary"
                  }
                >
                  {row?.decision === "APPROVED" ? "Approved" : row?.decision === "REJECTED" ? "Rejected" : isNext ? "Up next" : "Waiting"}
                </Badge>
              </li>
            );
          })}
        </ol>

        {!stage && <p className="text-sm font-medium">Every stage has been approved — the workflow is complete.</p>}

        {stage && canApprove && (
          <div className="grid gap-2 border-t pt-3">
            <Label htmlFor="approval-decision">Record a decision for {APPROVAL_STAGE_LABELS[stage]}</Label>
            <Select value={decision} onValueChange={(v) => setDecision(v as "APPROVED" | "REJECTED")}>
              <SelectTrigger id="approval-decision" className="max-w-xs">
                <SelectValue placeholder="Approve or reject…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">Approve</SelectItem>
                <SelectItem value="REJECTED">Reject</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder={decision === "REJECTED" ? "A comment is required when rejecting…" : "Optional comment…"}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button
              type="button"
              className="w-fit"
              disabled={isPending || !decision || (decision === "REJECTED" && !comment.trim())}
              onClick={handleSubmit}
            >
              {isPending ? "Recording…" : "Record decision"}
            </Button>
          </div>
        )}

        {stage && !canApprove && <p className="text-muted-foreground text-sm">Awaiting the Executive&apos;s decision.</p>}
      </CardContent>
    </Card>
  );
}
