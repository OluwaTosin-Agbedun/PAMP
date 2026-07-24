"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { closeInterviewWithOverrideAction } from "./actions";

/** Addendum §2.6 — "Close Interview with Three Valid Scores." Mandatory reason, Secretariat-only. */
export function CloseOverrideForm({ interviewId, missingPanelistName }: { interviewId: string; missingPanelistName: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await closeInterviewWithOverrideAction({ interviewId, reason });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Interview closed with three valid scores.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        {missingPanelistName} has not submitted a score. Closing this interview finalizes the average from the
        three valid submissions and permanently blocks any further score changes.
      </p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="grid gap-2">
        <Label htmlFor="close-override-reason">Reason</Label>
        <Textarea
          id="close-override-reason"
          required
          minLength={10}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this interview is being closed with three valid scores…"
        />
      </div>
      <Button type="submit" variant="destructive" disabled={isPending} className="justify-self-start">
        {isPending ? "Closing…" : "Close interview with three valid scores"}
      </Button>
    </form>
  );
}
