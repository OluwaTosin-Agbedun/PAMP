import { notFound } from "next/navigation";

import { FEATURE_FLAGS, isFeatureEnabled } from "@/lib/featureFlags/service";

/**
 * Analytics Dashboard (Planning Phase 5) — brand new, never reachable
 * before this route existed, so `feature.analytics` defaults off until
 * an administrator deliberately turns it on. Same `notFound()`-the-
 * whole-subtree pattern `feature.executive_dashboard` established.
 */
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  if (!(await isFeatureEnabled(FEATURE_FLAGS.ANALYTICS))) {
    notFound();
  }
  return children;
}
