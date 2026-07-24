"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { declareConflictAction } from "./actions";

/** Admin-recorded conflict of interest (Phase 3B's `declareConflictOfInterest`, reused) — excludes a reviewer from future selection on this application. */
export function DeclareConflictForm({
  applicationId,
  reviewers,
}: {
  applicationId: string;
  reviewers: { id: string; name: string }[];
}) {
  const [reviewerId, setReviewerId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await declareConflictAction(applicationId, { reviewerId, reason });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Conflict of interest recorded.");
      setReviewerId("");
      setReason("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="grid gap-2">
        <Label htmlFor="conflict-reviewer">Reviewer</Label>
        <Select value={reviewerId} onValueChange={setReviewerId} required>
          <SelectTrigger id="conflict-reviewer">
            <SelectValue placeholder="Select a reviewer" />
          </SelectTrigger>
          <SelectContent>
            {reviewers.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="conflict-reason">Reason</Label>
        <Textarea
          id="conflict-reason"
          required
          minLength={5}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain the conflict of interest…"
        />
      </div>
      <Button type="submit" disabled={isPending} className="justify-self-start">
        {isPending ? "Recording…" : "Record conflict"}
      </Button>
    </form>
  );
}
