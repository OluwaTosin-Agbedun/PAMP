"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { randomlyAssignReviewersForCohortAction } from "./actions";

/**
 * On-demand backfill for the automatic random-assignment engine — the
 * automatic decision engine assigns a reviewer the moment a case is
 * flagged Clarification Required, so this is only needed for
 * stragglers (applications imported before this existed, or left
 * unassigned by a since-changed reviewer pool). Never reassigns a
 * screening that already has a reviewer.
 */
export function RandomAssignReviewersButton({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRun() {
    startTransition(async () => {
      const result = await randomlyAssignReviewersForCohortAction(cohortId);
      if ("error" in result) {
        toast.error("Could not assign reviewers.", { description: result.error });
        return;
      }
      const summary = Object.entries(result.distribution)
        .map(([name, count]) => `${name}: ${count}`)
        .join(", ");
      toast.success(`Assigned ${result.assigned} of ${result.processed} unassigned application(s).`, {
        description: summary || "Nothing was unassigned.",
      });
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="secondary" disabled={isPending} onClick={handleRun}>
      {isPending ? "Assigning…" : "Randomly assign reviewers"}
    </Button>
  );
}
