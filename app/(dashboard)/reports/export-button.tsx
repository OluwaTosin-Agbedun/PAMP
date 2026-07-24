"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { exportAnalyticsAction } from "./actions";

export function ExportAnalyticsButton({ cohortId, filters }: { cohortId: string; filters: Record<string, string | undefined> }) {
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportAnalyticsAction({ cohortId, ...filters });
      if ("error" in result) {
        toast.error("Export failed.", { description: result.error });
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <Button type="button" variant="secondary" disabled={isPending} onClick={handleExport}>
      {isPending ? "Exporting…" : "Export CSV"}
    </Button>
  );
}
