"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { navGroupsForRole, pinnedNavItemForRole, type NavItem } from "@/lib/navigation";
import type { Role } from "@/lib/rbac/roles";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium text-white/90 transition-colors hover:bg-white/8",
        active && "bg-white/10 text-white",
        collapsed && "justify-center px-0",
      )}
    >
      <span
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-white/14",
          active && "bg-brand-gold",
        )}
      >
        <Icon className="size-3" />
      </span>
      {!collapsed && item.label}
    </Link>
  );
}

function NavGroupSection({
  group,
  pathname,
  collapsed,
  onNavigate,
}: {
  group: ReturnType<typeof navGroupsForRole>[number];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const groupHasActiveItem = group.items.some((item) => isActive(pathname, item.href));
  const [expanded, setExpanded] = useState(groupHasActiveItem || group.items.length <= 1);

  // Collapsed to an icon rail: there's no room for a group label/chevron,
  // so every item renders as a flat icon-only link instead — the group
  // header (with its own toggle state) reappears once expanded again.
  if (collapsed) {
    return (
      <div className="mb-0.5 grid gap-0.5">
        {group.items.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed onNavigate={onNavigate} />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-[10.5px] font-semibold tracking-wider text-white/60 uppercase hover:text-white/85"
        aria-expanded={expanded}
      >
        {group.label}
        <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="grid gap-0.5">
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarNav({
  role,
  collapsed,
  onNavigate,
}: {
  role: Role;
  /** Icon-only rail mode — omit (or false) for the normal labeled sidebar and the mobile drawer, which is never collapsed. */
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const pinnedItem = pinnedNavItemForRole(role);
  const groups = navGroupsForRole(role);

  return (
    <nav className={cn("grid gap-3", collapsed ? "px-1.5" : "px-2.5")}>
      {pinnedItem && (
        <NavLink item={pinnedItem} active={isActive(pathname, pinnedItem.href)} collapsed={collapsed} onNavigate={onNavigate} />
      )}
      <div>
        {groups.map((group) => (
          <NavGroupSection key={group.id} group={group} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}
