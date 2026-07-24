"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { approveFinalRankingAction, exportRankingCsvAction, generateFinalRankingAction, reopenFinalRankingAction } from "./actions";

export function RankingActions({
  cohortId,
  snapshot,
  canGenerate,
  canApprove,
  canReopen,
  canExport,
  hasPendingTies,
}: {
  cohortId: string;
  snapshot: { id: string; isLocked: boolean } | null;
  canGenerate: boolean;
  canApprove: boolean;
  canReopen: boolean;
  canExport: boolean;
  hasPendingTies: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [error, setError] = useState<string | undefined>();

  function run(action: () => Promise<{ success: true } | { error: string }>, onSuccess: () => void) {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        toast.error("Action failed.", { description: result.error });
        return;
      }
      toast.success("Done.");
      onSuccess();
      router.refresh();
    });
  }

  async function handleExport() {
    const result = await exportRankingCsvAction(cohortId);
    if ("error" in result) {
      toast.error("Export failed.", { description: result.error });
      return;
    }
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `final-ranking-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canGenerate && !snapshot?.isLocked && (
        <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
          <DialogTrigger asChild>
            <Button type="button">{snapshot ? "Recalculate ranking" : "Generate ranking"}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{snapshot ? "Recalculate the Final Ranking?" : "Generate the Final Ranking?"}</DialogTitle>
              <DialogDescription>
                Every currently-eligible application is ranked by final score (Application Review + Interview), using the
                Addendum&apos;s exact tie-break rule. This creates a new immutable ranking record and is fully audited.
              </DialogDescription>
            </DialogHeader>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => run(() => generateFinalRankingAction({ cohortId }), () => setGenerateOpen(false))}
              >
                {isPending ? "Generating…" : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canApprove && snapshot && !snapshot.isLocked && (
        <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary" disabled={hasPendingTies}>
              Approve ranking
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve this ranking?</DialogTitle>
              <DialogDescription>
                Once approved, this ranking is locked — its entries become the permanent historical record and can no longer
                be recalculated without an authorised reopen.
              </DialogDescription>
            </DialogHeader>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => run(() => approveFinalRankingAction({ rankingSnapshotId: snapshot.id }), () => setApproveOpen(false))}
              >
                {isPending ? "Approving…" : "Confirm approval"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {canApprove && snapshot && !snapshot.isLocked && hasPendingTies && (
        <p className="text-muted-foreground self-center text-sm">Resolve every Level 3 tie before approving.</p>
      )}

      {canReopen && snapshot?.isLocked && (
        <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              Reopen ranking
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reopen this approved ranking?</DialogTitle>
              <DialogDescription>A mandatory reason is recorded and audited.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="reopen-reason">Reason</Label>
              <Textarea
                id="reopen-reason"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                minLength={10}
                placeholder="Explain why this approved ranking is being reopened (at least 10 characters)…"
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="destructive"
                disabled={isPending || reopenReason.trim().length < 10}
                onClick={() =>
                  run(
                    () => reopenFinalRankingAction({ rankingSnapshotId: snapshot.id, reason: reopenReason }),
                    () => {
                      setReopenOpen(false);
                      setReopenReason("");
                    },
                  )
                }
              >
                {isPending ? "Reopening…" : "Confirm reopen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canExport && snapshot && (
        <Button type="button" variant="outline" onClick={handleExport}>
          <Download />
          Export CSV
        </Button>
      )}
    </div>
  );
}
