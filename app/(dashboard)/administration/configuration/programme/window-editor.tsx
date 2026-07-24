"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateApplicationReviewWindowAction, updateProgrammeWindowAction } from "../actions";

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

type Props = {
  programmeId: string;
  cohortId: string;
  opensAt: string | null;
  closesAt: string | null;
  canManage: boolean;
} & (
  | { kind: "review-stage"; reviewStageId: string }
  | { kind: "programme-window"; windowCode: "ELIGIBILITY_REVIEW" | "INTERVIEW" | "EXECUTIVE_APPROVAL" | "OFFER" }
);

/** One `opensAt`/`closesAt` pair, shared by the Application Review
 *  Window (a `ReviewStage`) and the four `ProgrammeWindow` rows —
 *  same editing UI regardless of which table the dates actually live
 *  in, since that distinction is a backend detail (see ADR-0013). */
export function WindowEditor(props: Props) {
  const [opensAt, setOpensAt] = useState(toLocalInputValue(props.opensAt));
  const [closesAt, setClosesAt] = useState(toLocalInputValue(props.closesAt));
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const input = {
        opensAt: opensAt ? new Date(opensAt).toISOString() : null,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      };
      const result =
        props.kind === "review-stage"
          ? await updateApplicationReviewWindowAction(props.programmeId, props.cohortId, props.reviewStageId, input)
          : await updateProgrammeWindowAction(props.programmeId, props.cohortId, { code: props.windowCode, ...input });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Window updated.");
    });
  }

  const idPrefix = props.kind === "review-stage" ? "review-window" : props.windowCode.toLowerCase();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-opens`}>Opens</Label>
        <Input id={`${idPrefix}-opens`} type="datetime-local" value={opensAt} disabled={!props.canManage} onChange={(e) => setOpensAt(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-closes`}>Closes</Label>
        <Input id={`${idPrefix}-closes`} type="datetime-local" value={closesAt} disabled={!props.canManage} onChange={(e) => setClosesAt(e.target.value)} />
      </div>
      {props.canManage && (
        <div className="sm:col-span-2">
          <Button onClick={save} disabled={isPending} size="sm">
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
