import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A plain div-based progress bar — no @radix-ui/react-progress dependency
 * (not already installed; this codebase's other primitives use Radix
 * where a primitive is already a dependency, but a labelled `role`
 * attribute gets the same accessibility guarantee here without adding
 * one for a single bar).
 */
function Progress({
  className,
  value,
  label,
  ...props
}: React.ComponentProps<"div"> & { value: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      data-slot="progress"
      className={cn("bg-primary/15 relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <div className="bg-primary h-full rounded-full transition-[width]" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export { Progress };
