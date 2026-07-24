"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";

import { setQuestionActiveAction } from "./actions";

export function QuestionActiveToggle({ questionId, isActive }: { questionId: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        await setQuestionActiveAction(questionId, !isActive);
        toast.success(isActive ? "Question deactivated." : "Question activated.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  return <Switch checked={isActive} onCheckedChange={toggle} disabled={isPending} />;
}
