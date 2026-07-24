"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/review-operations", label: "Dashboard" },
  { href: "/review-operations/risk", label: "Risk Dashboard" },
  { href: "/review-operations/assignments", label: "Assignments" },
  { href: "/review-operations/workload", label: "Reviewer Workload" },
  { href: "/review-operations/escalations", label: "Third Reviews" },
  { href: "/review-operations/conflicts", label: "Conflicts & Recusals" },
];

/** Local, in-page tab navigation for the Secretariat's Review Operations Workspace — the global sidebar keeps one entry (Phase 3B.1's approved 12-item taxonomy isn't expanded for this). */
export function WorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b" aria-label="Review operations sections">
      {TABS.map((tab) => {
        const active = tab.href === "/review-operations" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "border-primary text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
