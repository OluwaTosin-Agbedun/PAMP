import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/permissions/guard";

/**
 * requireUser (not just requireSession) here is deliberate: this layout
 * wraps every page under /dashboard, so it's the one place that
 * guarantees a fresh, database-verified status/role check — and the
 * forced password-change redirect — runs on every dashboard request,
 * not just on pages that remember to call it themselves.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <DashboardShell role={user.role} userName={user.name ?? "Staff member"} userEmail={user.email ?? ""}>
      {children}
    </DashboardShell>
  );
}
