"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  escalateAction,
  markDisqualifiedAction,
  markEligibleAction,
  markIneligibleAction,
  requestClarificationAction,
} from "../actions";

type Action = "ELIGIBLE" | "CLARIFY" | "INELIGIBLE" | "ESCALATE" | "DISQUALIFY";

const CONFIG: Record<Action, { title: string; description: string; placeholder: string; buttonLabel: string; variant: "default" | "destructive" }> = {
  ELIGIBLE: {
    title: "Mark Eligible — Proceed to Application Review?",
    description: "The applicant meets the basic eligibility and document requirements.",
    placeholder: "Brief reason for this decision…",
    buttonLabel: "Mark Eligible",
    variant: "default",
  },
  CLARIFY: {
    title: "Request Clarification?",
    description: "Specify exactly what needs to be confirmed before screening can continue.",
    placeholder: "What requires clarification?",
    buttonLabel: "Request Clarification",
    variant: "default",
  },
  INELIGIBLE: {
    title: "Mark Ineligible — Do Not Proceed?",
    description: "The applicant does not meet the minimum eligibility requirements.",
    placeholder: "Reason for this decision…",
    buttonLabel: "Mark Ineligible",
    variant: "destructive",
  },
  ESCALATE: {
    title: "Escalate this application?",
    description: "Send this case for further review before a final decision is made.",
    placeholder: "Reason for escalation…",
    buttonLabel: "Escalate",
    variant: "default",
  },
  DISQUALIFY: {
    title: "Mark Disqualified?",
    description: "A confirmed serious integrity concern, false information, or fraudulent/duplicate application.",
    placeholder: "Integrity reason (required)…",
    buttonLabel: "Mark Disqualified",
    variant: "destructive",
  },
};

function DecisionDialog({
  action,
  applicationId,
  canMarkEligible,
  canDisqualify,
  trigger,
}: {
  action: Action;
  applicationId: string;
  canMarkEligible: boolean;
  canDisqualify: boolean;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [secondReviewRequired, setSecondReviewRequired] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const config = CONFIG[action];

  const disabled = action === "ELIGIBLE" ? !canMarkEligible : action === "DISQUALIFY" ? !canDisqualify : false;

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await (action === "ELIGIBLE"
        ? markEligibleAction({ applicationId, reasonForDecision: text, secondReviewRequired })
        : action === "CLARIFY"
          ? requestClarificationAction({ applicationId, outstandingClarification: text })
          : action === "INELIGIBLE"
            ? markIneligibleAction({ applicationId, reasonForDecision: text })
            : action === "ESCALATE"
              ? escalateAction({ applicationId, reasonForDecision: text })
              : markDisqualifiedAction({ applicationId, integrityNote: text }));

      if ("error" in result) {
        setError(result.error);
        toast.error("Action failed.", { description: result.error });
        return;
      }
      toast.success("Recorded.");
      setOpen(false);
      setText("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild disabled={disabled}>
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={config.placeholder} minLength={5} />
          {action === "ELIGIBLE" && (
            <div className="flex items-center gap-2">
              <Switch id="second-review" checked={secondReviewRequired} onCheckedChange={setSecondReviewRequired} />
              <Label htmlFor="second-review" className="text-sm font-normal">
                Second review required
              </Label>
            </div>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant={config.variant} disabled={isPending || text.trim().length < 5} onClick={submit}>
            {isPending ? "Submitting…" : config.buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DecisionPanel({
  applicationId,
  canPerform,
  canDisqualify,
  canMarkEligible,
}: {
  applicationId: string;
  canPerform: boolean;
  canDisqualify: boolean;
  canMarkEligible: boolean;
}) {
  if (!canPerform && !canDisqualify) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Final Screening Decision</CardTitle>
        <CardDescription>Eligible, Clarification Required, Ineligible, or Disqualified — one final decision per screening.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {canPerform && (
          <>
            <DecisionDialog
              action="ELIGIBLE"
              applicationId={applicationId}
              canMarkEligible={canMarkEligible}
              canDisqualify={canDisqualify}
              trigger={<Button type="button" title={!canMarkEligible ? "Every checklist item must be resolved first" : undefined}>Mark Eligible</Button>}
            />
            <DecisionDialog
              action="CLARIFY"
              applicationId={applicationId}
              canMarkEligible={canMarkEligible}
              canDisqualify={canDisqualify}
              trigger={<Button type="button" variant="outline">Request Clarification</Button>}
            />
            <DecisionDialog
              action="INELIGIBLE"
              applicationId={applicationId}
              canMarkEligible={canMarkEligible}
              canDisqualify={canDisqualify}
              trigger={<Button type="button" variant="destructive">Mark Ineligible</Button>}
            />
            <DecisionDialog
              action="ESCALATE"
              applicationId={applicationId}
              canMarkEligible={canMarkEligible}
              canDisqualify={canDisqualify}
              trigger={<Button type="button" variant="outline">Escalate</Button>}
            />
          </>
        )}
        {canDisqualify && (
          <DecisionDialog
            action="DISQUALIFY"
            applicationId={applicationId}
            canMarkEligible={canMarkEligible}
            canDisqualify={canDisqualify}
            trigger={<Button type="button" variant="destructive">Mark Disqualified</Button>}
          />
        )}
      </CardContent>
    </Card>
  );
}
