"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { runAutomaticEligibilityForCohortAction } from "./actions";

/**
 * Runs the PAM-P Application Eligibility Criteria engine against every
 * application still awaiting a confirmed decision (`PENDING_SCREENING`/
 * `IN_PROGRESS`) — for applications imported before this engine
 * existed, or re-imported since. A screening a human has already
 * confirmed is never touched, so this is always safe to run again.
 */
export function RunAutomaticEligibilityButton({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRun() {
    startTransition(async () => {
      const result = await runAutomaticEligibilityForCohortAction(cohortId);
      if ("error" in result) {
        toast.error("Could not run automatic screening.", { description: result.error });
        return;
      }
      const summary = Object.entries(result.outcomes)
        .map(([status, count]) => `${count} ${status.toLowerCase().replace(/_/g, " ")}`)
        .join(", ");
      toast.success(`Screened ${result.processed} application(s).`, { description: summary || "Nothing was awaiting a decision." });
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="secondary" disabled={isPending} onClick={handleRun}>
      {isPending ? "Running…" : "Run automatic eligibility screening"}
    </Button>
  );
}
