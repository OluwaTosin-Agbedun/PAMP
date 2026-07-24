"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { updateChecklistItemAction } from "../actions";
import type { ChecklistItemViewModel } from "../types";

const SECTION_STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  DOCUMENT: [
    { value: "PASS", label: "Pass" },
    { value: "FAIL", label: "Fail" },
    { value: "CLARIFY", label: "Clarify" },
  ],
  BASELINE: [
    { value: "PASS", label: "Pass" },
    { value: "FAIL", label: "Fail" },
    { value: "CLARIFY", label: "Clarify" },
  ],
  INTEGRITY: [
    { value: "CLEAR", label: "Clear" },
    { value: "FLAG", label: "Flag" },
    { value: "CLARIFY", label: "Clarify" },
  ],
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PASS: "default",
  CLEAR: "default",
  FAIL: "destructive",
  FLAG: "destructive",
  CLARIFY: "outline",
};

function ChecklistItemRow({ item, applicationId, canEdit }: { item: ChecklistItemViewModel; applicationId: string; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(item.status ?? "");
  const [comment, setComment] = useState(item.comment ?? "");

  function save() {
    startTransition(async () => {
      const result = await updateChecklistItemAction({
        applicationId,
        section: item.section,
        itemKey: item.itemKey,
        status: status || null,
        comment: comment || null,
      });
      if ("error" in result) {
        toast.error("Couldn't save.", { description: result.error });
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{item.label}</p>
          {item.isAutomatic && (
            <Badge variant="outline" title="System-suggested — confirm or override">
              Auto-suggested
            </Badge>
          )}
          {item.status && <Badge variant={STATUS_BADGE_VARIANT[item.status]}>{item.status}</Badge>}
        </div>
        <p className="text-muted-foreground text-xs">{item.evidence}</p>
      </div>

      {canEdit && (
        <div className="grid gap-2 sm:w-72">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {SECTION_STATUS_OPTIONS[item.section].map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Comment / issue…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-16 text-sm"
          />
          <Button type="button" size="sm" variant="secondary" className="w-fit" onClick={save} disabled={isPending || !status}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ChecklistSectionCard({
  title,
  description,
  items,
  applicationId,
  canEdit,
}: {
  title: string;
  description: string;
  items: ChecklistItemViewModel[];
  applicationId: string;
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {items.map((item) => (
          <ChecklistItemRow key={`${item.section}-${item.itemKey}`} item={item} applicationId={applicationId} canEdit={canEdit} />
        ))}
      </CardContent>
    </Card>
  );
}
