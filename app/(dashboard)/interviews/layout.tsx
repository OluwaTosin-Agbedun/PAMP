import { notFound } from "next/navigation";

import { FEATURE_FLAGS, isFeatureEnabled } from "@/lib/featureFlags/service";

/**
 * Interview Module Completion (Planning Phase 2) — `feature.interview_module`
 * now actually gates the module's staff-facing routes, the same
 * "hidden nav item AND blocked route" pattern `feature.exports` already
 * established (docs/FEATURE_FLAGS.md). The applicant-facing booking
 * page (`/interview/book/[token]`, outside this route group) is
 * deliberately NOT gated here — an applicant who already has a booking
 * link should never have it stop working because an administrator
 * toggled a staff-facing flag.
 */
export default async function InterviewsLayout({ children }: { children: React.ReactNode }) {
  if (!(await isFeatureEnabled(FEATURE_FLAGS.INTERVIEW_MODULE))) {
    notFound();
  }
  return children;
}
