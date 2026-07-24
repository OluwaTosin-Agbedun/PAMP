"use client";

import { useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { reassignAssignmentAction } from "./actions";

type ReassignableAssignment = { id: string; slot: string; reviewerId: string; reviewerName: string };

export function ReassignDialog({
  applicationId,
  assignments,
  availableReviewers,
}: {
  applicationId: string;
  assignments: ReassignableAssignment[];
  availableReviewers: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [assignmentId, setAssignmentId] = useState<string>("");
  const [newReviewerId, setNewReviewerId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await reassignAssignmentAction(applicationId, { assignmentId, newReviewerId, reason });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Assignment reassigned.");
      setOpen(false);
      setAssignmentId("");
      setNewReviewerId("");
      setReason("");
    });
  }

  const candidateReviewers = availableReviewers.filter(
    (r) => !assignments.some((a) => a.id === assignmentId && a.reviewerId === r.id),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={assignments.length === 0}>
          Reassign a reviewer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign a reviewer</DialogTitle>
          <DialogDescription>
            The original assignment is preserved as history, not overwritten — a mandatory reason is
            recorded and audited.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="grid gap-2">
            <Label htmlFor="assignment-select">Current assignment</Label>
            <Select value={assignmentId} onValueChange={setAssignmentId} required>
              <SelectTrigger id="assignment-select">
                <SelectValue placeholder="Select an assignment" />
              </SelectTrigger>
              <SelectContent>
                {assignments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.slot}: {a.reviewerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reviewer-select">Replacement reviewer</Label>
            <Select value={newReviewerId} onValueChange={setNewReviewerId} required>
              <SelectTrigger id="reviewer-select">
                <SelectValue placeholder="Select a reviewer" />
              </SelectTrigger>
              <SelectContent>
                {candidateReviewers.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              The server independently re-checks eligibility (capacity, conflicts, active status,
              duplicate assignment) regardless of what appears here.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reassign-reason">Reason</Label>
            <Textarea
              id="reassign-reason"
              required
              minLength={10}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this reassignment is needed (at least 10 characters)…"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || !assignmentId || !newReviewerId}>
              {isPending ? "Reassigning…" : "Confirm reassignment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
