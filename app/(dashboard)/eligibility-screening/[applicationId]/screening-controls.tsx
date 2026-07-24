"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  assignScreenerAction,
  extendClarificationDeadlineAction,
  performSecondReviewAction,
  reopenScreeningAction,
  resolveClarificationAction,
} from "../actions";

export function AssignScreenerControl({
  applicationId,
  currentScreenerId,
  screeners,
  canAssign,
}: {
  applicationId: string;
  currentScreenerId: string | null;
  screeners: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [screenerId, setScreenerId] = useState(currentScreenerId ?? "");

  if (!canAssign) return null;

  function assign(value: string) {
    setScreenerId(value);
    startTransition(async () => {
      const result = await assignScreenerAction({ applicationId, screenerId: value });
      if ("error" in result) {
        toast.error("Couldn't assign screener.", { description: result.error });
        return;
      }
      toast.success("Screener assigned.");
      router.refresh();
    });
  }

  return (
    <Select value={screenerId} onValueChange={assign} disabled={isPending}>
      <SelectTrigger className="w-full sm:w-64">
        <SelectValue placeholder="Assign a screener…" />
      </SelectTrigger>
      <SelectContent>
        {screeners.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ResolveClarificationButton({ applicationId, visible }: { applicationId: string; visible: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  if (!visible) return null;

  function resolve() {
    startTransition(async () => {
      const result = await resolveClarificationAction(applicationId);
      if ("error" in result) {
        toast.error("Couldn't resume screening.", { description: result.error });
        return;
      }
      toast.success("Screening resumed.");
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="secondary" onClick={resolve} disabled={isPending}>
      {isPending ? "Resuming…" : "Clarification received — resume screening"}
    </Button>
  );
}

export function SecondReviewButton({ applicationId, visible }: { applicationId: string; visible: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  if (!visible) return null;

  function submit() {
    startTransition(async () => {
      const result = await performSecondReviewAction({ applicationId, note: note || undefined });
      if ("error" in result) {
        toast.error("Couldn't record second review.", { description: result.error });
        return;
      }
      toast.success("Second review recorded.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Perform second review
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Second review</DialogTitle>
          <DialogDescription>Confirms this screening&apos;s decision. The original screener cannot perform their own second review.</DialogDescription>
        </DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note…" />
        <DialogFooter>
          <Button type="button" disabled={isPending} onClick={submit}>
            {isPending ? "Submitting…" : "Confirm second review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExtendClarificationDeadlineButton({ applicationId, visible }: { applicationId: string; visible: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  if (!visible) return null;

  function submit() {
    startTransition(async () => {
      const result = await extendClarificationDeadlineAction({ applicationId, reason });
      if ("error" in result) {
        toast.error("Couldn't extend the deadline.", { description: result.error });
        return;
      }
      toast.success("Deadline extended.");
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Extend clarification deadline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend the clarification deadline?</DialogTitle>
          <DialogDescription>
            Resets this application&apos;s response window to a fresh default period from now. A mandatory reason is
            recorded and audited.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why the deadline is being extended (at least 10 characters)…" />
        <DialogFooter>
          <Button type="button" disabled={isPending || reason.trim().length < 10} onClick={submit}>
            {isPending ? "Extending…" : "Confirm extension"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReopenScreeningButton({ applicationId, visible }: { applicationId: string; visible: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  if (!visible) return null;

  function submit() {
    startTransition(async () => {
      const result = await reopenScreeningAction({ applicationId, reason });
      if ("error" in result) {
        toast.error("Couldn't reopen.", { description: result.error });
        return;
      }
      toast.success("Screening reopened.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive">
          Reopen screening
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen this confirmed decision?</DialogTitle>
          <DialogDescription>A mandatory reason is recorded and audited. The application&apos;s eligibility status returns to Pending.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this decision is being reopened (at least 10 characters)…" />
        <DialogFooter>
          <Button type="button" variant="destructive" disabled={isPending || reason.trim().length < 10} onClick={submit}>
            {isPending ? "Reopening…" : "Confirm reopen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
