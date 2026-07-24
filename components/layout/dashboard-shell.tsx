"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/rbac/roles";
import { ROLE_LABELS } from "@/lib/rbac/roles";

import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

const STORAGE_KEY = "efms-sidebar-collapsed";
const EXPANDED_WIDTH = 248;
const COLLAPSED_WIDTH = 68;

/**
 * The collapsed/expanded preference lives in localStorage, read through
 * `useSyncExternalStore` rather than `useState` + `useEffect` — this is
 * the pattern React itself recommends for syncing with an external,
 * non-React data source: no setState-in-effect cascade, and
 * `getServerSnapshot` gives the server-rendered markup a deterministic
 * `false` (expanded) so hydration always matches what the server sent,
 * even for a returning visitor whose stored preference is `true`. That
 * visitor sees one render flip from expanded to collapsed right after
 * hydration — an accepted, standard tradeoff for not needing a
 * server-side cookie round trip for what's a purely cosmetic
 * preference, not a security-relevant one.
 */
const collapseListeners = new Set<() => void>();

function subscribeToCollapsePreference(listener: () => void) {
  collapseListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    collapseListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getCollapsePreference() {
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function getServerCollapsePreference() {
  return false;
}

function setCollapsePreference(next: boolean) {
  window.localStorage.setItem(STORAGE_KEY, String(next));
  collapseListeners.forEach((listener) => listener());
}

export function DashboardShell({
  role,
  userName,
  userEmail,
  children,
}: {
  role: Role;
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}) {
  const collapsed = useSyncExternalStore(
    subscribeToCollapsePreference,
    getCollapsePreference,
    getServerCollapsePreference,
  );

  function toggle() {
    setCollapsePreference(!collapsed);
  }

  const asideWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <div className="flex min-h-screen w-full">
      <aside
        style={{ width: asideWidth }}
        className="fixed inset-y-0 left-0 hidden shrink-0 flex-col bg-primary transition-[width] duration-200 md:flex"
      >
        <div
          className={cn(
            "flex items-center gap-2.5 border-b border-white/12 py-5",
            collapsed ? "justify-center px-2" : "px-[18px]",
          )}
        >
          <Image
            src="/pamp-logo.jpeg"
            alt="PAM-P"
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-full object-cover"
          />
          {!collapsed && (
            <div className="min-w-0 leading-[1.15]">
              <div className="text-[13.5px] font-bold tracking-wide text-white">EFMS</div>
              <div className="truncate text-[10.5px] text-white/85">Pius Anyim Mentorship Prog.</div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-3.5">
          <SidebarNav role={role} collapsed={collapsed} />
        </div>

        <div className={cn("border-t border-white/12 py-3.5", collapsed ? "px-2" : "px-4")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "mb-2.5 w-full text-white/80 hover:bg-white/10 hover:text-white",
              collapsed ? "justify-center px-0" : "justify-start gap-2",
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && "Collapse"}
          </Button>
          {!collapsed && (
            <>
              <div className="mb-1.5 text-[9.5px] font-medium tracking-wider text-white/70 uppercase">
                Signed in as
              </div>
              <div className="rounded-[7px] border border-white/18 bg-white/10 px-2 py-1.5 text-xs font-semibold text-white">
                {ROLE_LABELS[role]}
              </div>
            </>
          )}
        </div>
      </aside>

      <div
        className={cn(
          "flex flex-1 flex-col transition-[margin-left] duration-200",
          collapsed ? "md:ml-[68px]" : "md:ml-[248px]",
        )}
      >
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card px-4 md:px-6">
          <MobileNav role={role} />
          <span className="text-[15px] font-bold text-primary md:hidden">EFMS</span>
          <div className="ml-auto flex items-center gap-4">
            <UserMenu name={userName} email={userEmail} role={role} />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}
