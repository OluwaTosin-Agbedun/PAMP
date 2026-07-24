import {
  Bell,
  ClipboardList,
  FileBarChart,
  Flag,
  GraduationCap,
  History,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  ListOrdered,
  Mail,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Stamp,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

import { PERMISSIONS, type Permission } from "@/lib/permissions/catalog";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import type { Role } from "@/lib/rbac/roles";

export type NavItem = {
  /** Omit for items every active staff role sees regardless of permission (Dashboard). */
  permission?: Permission;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Flip to true once the route for this permission ships. */
  implemented: boolean;
};

/** Rendered pinned at the top of the sidebar, outside any collapsible group. */
export const PINNED_NAV_ITEM: NavItem = {
  label: "Dashboard",
  href: "/dashboard",
  icon: LayoutDashboard,
  implemented: true,
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

/**
 * The approved PAM-P workflow taxonomy (Phase 3B.1,
 * docs/ROLE_AND_NAVIGATION_RECONCILIATION.md) — Dashboard (pinned, above)
 * plus these 11 groups, in this exact order, is the complete, authoritative
 * navigation model. Each of the 12 approved taxonomy items maps to exactly
 * one top-level entry here; nothing is nested two levels deep. A group
 * with a single item still renders correctly — components/layout/
 * {sidebar-nav,mobile-nav}.tsx needed no changes for this reconciliation,
 * since both already render whatever this file returns generically.
 *
 * A future/unbuilt module (Notifications) still gets its taxonomy slot
 * now, marked `implemented: false` — so shipping it later is a one-line
 * flip, not a navigation restructure, per this phase's "future modules
 * may remain hidden... but the taxonomy must not conflict" requirement.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "applicant-import",
    label: "Applicant Import",
    items: [
      { permission: PERMISSIONS.APPLICATIONS_VIEW, label: "Applicants", href: "/applicants", icon: ClipboardList, implemented: true },
      { permission: PERMISSIONS.APPLICATIONS_IMPORT, label: "Import Applicants", href: "/applicants/import", icon: Upload, implemented: true },
    ],
  },
  {
    id: "eligibility-screening",
    label: "Eligibility Screening",
    items: [
      // PAM-P 2026 Eligibility Screening Checklist — the actual Stage 1
      // human-screener workspace, first item in this slot so it's the
      // default entry point (criteria/recommendations are supporting
      // admin/QA screens for the same stage, not the primary workflow).
      { permission: PERMISSIONS.ELIGIBILITY_SCREENING_VIEW, label: "Eligibility Screening", href: "/eligibility-screening", icon: ListChecks, implemented: true },
      // Release 1.5 — the Programme Secretariat's triage queue for
      // Eligibility Reviewer recommendations; per-application detail
      // (flagging, and the execute/dismiss actions themselves) lives on
      // the applicant detail page, not here.
      { permission: PERMISSIONS.ELIGIBILITY_OVERRIDE_EXECUTE, label: "Eligibility Recommendations", href: "/eligibility-recommendations", icon: ListChecks, implemented: true },
    ],
  },
  {
    id: "application-review",
    label: "Application Review",
    items: [
      { permission: PERMISSIONS.REVIEWS_VIEW, label: "Application Review", href: "/reviews", icon: FileBarChart, implemented: true },
      // Phase 3D — the Programme Secretariat's operations workspace.
      // Deliberately a second item inside this same approved taxonomy
      // slot (item 4, "Application Review"), not a 13th top-level nav
      // group — Phase 3B.1's reconciliation established the 12-item
      // taxonomy as closed; this is the Secretariat's view onto the same
      // stage a reviewer's own "Application Review" link covers, not a
      // new stage. Gated by `review_operations.view`, which no
      // APPLICATION_REVIEWER/ELIGIBILITY_REVIEWER role has, so a
      // reviewer's own nav is unaffected.
      {
        permission: PERMISSIONS.REVIEW_OPERATIONS_VIEW,
        label: "Review Operations",
        href: "/review-operations",
        icon: LayoutGrid,
        implemented: true,
      },
    ],
  },
  {
    id: "interview-management",
    label: "Interview Management",
    items: [
      // Release 1 Module 2 — the panellist-facing Interview Workspace
      // ships first; Interview Scheduling (Enterprise Functional
      // Specification Addendum) adds the panellist's availability
      // screen and the Secretariat's scheduling operator screen to this
      // same taxonomy slot — the same "one slot, multiple role-scoped
      // views" pattern "Application Review" already established for
      // reviewers vs. Programme Secretariat. The full Interview
      // Operations Workspace (attendance/analytics/export) remains a
      // later, separate scope item.
      { permission: PERMISSIONS.INTERVIEWS_VIEW, label: "Interview Workspace", href: "/interviews", icon: MessagesSquare, implemented: true },
      {
        permission: PERMISSIONS.INTERVIEW_AVAILABILITY_MANAGE,
        label: "My Interview Availability",
        href: "/interviews/availability",
        icon: MessagesSquare,
        implemented: true,
      },
      {
        permission: PERMISSIONS.INTERVIEW_SCHEDULING_MANAGE,
        label: "Interview Scheduling",
        href: "/interviews/scheduling",
        icon: MessagesSquare,
        implemented: true,
      },
      // Addendum Module 3 — the mandatory/pathway/additional-bank question
      // bank. Same "one slot, multiple role-scoped views" taxonomy this
      // group already uses, not a new group — the 12-item taxonomy is
      // closed (Phase 3B.1, docs/ROLE_AND_NAVIGATION_RECONCILIATION.md).
      {
        permission: PERMISSIONS.INTERVIEW_QUESTIONS_MANAGE,
        label: "Interview Questions",
        href: "/interviews/questions",
        icon: MessagesSquare,
        implemented: true,
      },
    ],
  },
  {
    id: "selection-committee",
    label: "Selection Committee",
    items: [
      // Addendum Modules 4-5 — the Final Ranking Workspace lives in this
      // taxonomy slot rather than a 13th top-level group (the 12-item
      // taxonomy is closed, Phase 3B.1): Final Ranking is the mechanism
      // that feeds Module 6's Selection Committee confirmation, the same
      // "one slot, multiple role-scoped views" pattern "Interview
      // Management" already established for its four items.
      { permission: PERMISSIONS.RANKING_VIEW, label: "Final Ranking", href: "/ranking", icon: ListOrdered, implemented: true },
      { permission: PERMISSIONS.COMMITTEE_VIEW, label: "Selection Committee", href: "/selection-committee", icon: ShieldCheck, implemented: false },
    ],
  },
  {
    id: "executive-approval",
    label: "Executive Approval",
    items: [
      { permission: PERMISSIONS.EXECUTIVE_VIEW, label: "Executive Approval", href: "/executive-approval", icon: Stamp, implemented: true },
    ],
  },
  {
    id: "admissions",
    label: "Admissions",
    items: [
      { permission: PERMISSIONS.ADMISSIONS_VIEW, label: "Admissions", href: "/admissions", icon: GraduationCap, implemented: false },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      { permission: PERMISSIONS.REPORTS_VIEW, label: "Reports", href: "/reports", icon: FileBarChart, implemented: true },
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    items: [
      { permission: PERMISSIONS.NOTIFICATIONS_VIEW, label: "Notifications", href: "/notifications", icon: Bell, implemented: false },
    ],
  },
  {
    id: "audit-trail",
    label: "Audit Trail",
    items: [
      { permission: PERMISSIONS.AUDIT_VIEW, label: "Audit Trail", href: "/audit-trail", icon: History, implemented: false },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      { permission: PERMISSIONS.USERS_VIEW, label: "Users", href: "/users", icon: Users, implemented: true },
      // Release 1.5 — "Only the following roles may access it: Director,
      // Programme Administrator, System Administrator" is enforced by
      // configuration.view itself (granted to exactly those three roles,
      // see lib/permissions/rolePermissions.ts), not by nav visibility.
      {
        permission: PERMISSIONS.CONFIGURATION_VIEW,
        label: "Configuration Centre",
        href: "/administration/configuration",
        icon: Settings,
        implemented: true,
      },
      {
        permission: PERMISSIONS.FEATURE_FLAGS_MANAGE,
        label: "Feature Flags",
        href: "/administration/feature-flags",
        icon: Flag,
        implemented: true,
      },
      // Notification Infrastructure — delivery monitoring + template
      // management, the admin/operator screen. Distinct from the
      // "notifications" nav group above, which is a future personal
      // in-app inbox (still `implemented: false`) gated by the broader
      // NOTIFICATIONS_VIEW — this is NOTIFICATIONS_ADMINISTER, the
      // narrower operator capability.
      {
        permission: PERMISSIONS.NOTIFICATIONS_ADMINISTER,
        label: "Notification Delivery",
        href: "/administration/notifications",
        icon: Mail,
        implemented: true,
      },
    ],
  },
];

function visibleItems(items: NavItem[], role: Role): NavItem[] {
  const granted = permissionsForRole(role);
  return items.filter((item) => item.implemented && (!item.permission || granted.includes(item.permission)));
}

export function pinnedNavItemForRole(role: Role): NavItem | null {
  const [item] = visibleItems([PINNED_NAV_ITEM], role);
  return item ?? null;
}

export function navGroupsForRole(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({ ...group, items: visibleItems(group.items, role) })).filter(
    (group) => group.items.length > 0,
  );
}
