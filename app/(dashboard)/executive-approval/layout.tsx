import { notFound } from "next/navigation";

import { FEATURE_FLAGS, isFeatureEnabled } from "@/lib/featureFlags/service";

/**
 * Executive Dashboard (Planning Phase 4) — brand new, never reachable
 * through RBAC before this route existed, so `feature.executive_dashboard`
 * defaults off (the "not-yet-built feature" precedent, not
 * `feature.interview_module`'s "already shipped" one) until an
 * administrator deliberately turns it on.
 */
export default async function ExecutiveApprovalLayout({ children }: { children: React.ReactNode }) {
  if (!(await isFeatureEnabled(FEATURE_FLAGS.EXECUTIVE_DASHBOARD))) {
    notFound();
  }
  return children;
}
