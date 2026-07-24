"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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

import { deleteApplicantAction } from "./actions";

/**
 * A soft delete — the record is hidden from every normal view but never
 * physically removed (see `Applicant.deletedAt`/`Application.deletedAt`).
 */
export function DeleteApplicantButton({ applicationId, applicantName }: { applicationId: string; applicantName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteApplicantAction(applicationId, reason);
      if ("error" in result) {
        toast.error("Could not delete applicant.", { description: result.error });
        return;
      }
      toast.success(`${applicantName} deleted.`);
      setOpen(false);
      router.push("/applicants");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          <Trash2 />
          Delete applicant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {applicantName}?</DialogTitle>
          <DialogDescription>
            This removes the applicant and their application from every list and report. This can only be undone by a
            System Administrator directly.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="delete-reason">Reason</Label>
          <Textarea
            id="delete-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this applicant being deleted?"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending || reason.trim().length < 5}>
            {isPending ? "Deleting…" : "Delete applicant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
