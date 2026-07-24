/**
 * Addendum §2.5–§2.6 — minimum submission threshold and Secretariat
 * override eligibility. Pure, no I/O — mirrors interviewScoring.ts's/
 * interviewScoreValidation.ts's "pure calculation function" convention.
 *
 * Active-panel-size-aware rather than hardcoded to 4: cancelPanelist()
 * (panelAssignmentService.ts) never auto-replaces a cancelled seat, so an
 * interview's active panel can legitimately be fewer than 4 by the time
 * scoring happens.
 */

export type SubmissionThresholdStatus = "INCOMPLETE" | "ALL_SUBMITTED" | "OVERRIDE_ELIGIBLE" | "OVERRIDE_NOT_ELIGIBLE";

export type SubmissionThresholdResult = {
  status: SubmissionThresholdStatus;
  activeCount: number;
  submittedCount: number;
  /** Only set when status === "OVERRIDE_ELIGIBLE" — the one active panellist without a SUBMITTED score. */
  missingPanelistId: string | null;
};

const MINIMUM_VALID_SUBMISSIONS = 3;

export function evaluateSubmissionThreshold(
  activePanelistUserIds: string[],
  scores: { panelistId: string; status: string }[],
): SubmissionThresholdResult {
  const submittedIds = new Set(scores.filter((s) => s.status === "SUBMITTED").map((s) => s.panelistId));
  const activeCount = activePanelistUserIds.length;
  const missing = activePanelistUserIds.filter((id) => !submittedIds.has(id));
  const submittedCount = activeCount - missing.length;

  if (missing.length === 0) {
    return { status: "ALL_SUBMITTED", activeCount, submittedCount, missingPanelistId: null };
  }
  if (submittedCount >= MINIMUM_VALID_SUBMISSIONS && missing.length === 1) {
    return { status: "OVERRIDE_ELIGIBLE", activeCount, submittedCount, missingPanelistId: missing[0] };
  }
  return {
    status: submittedCount >= MINIMUM_VALID_SUBMISSIONS ? "OVERRIDE_NOT_ELIGIBLE" : "INCOMPLETE",
    activeCount,
    submittedCount,
    missingPanelistId: null,
  };
}

/**
 * Threshold met = the average is computable and becomes visible to
 * panellists (§2.4's "after all required submissions"). Reaching 3 valid
 * submissions alone does not meet it — only every active panellist
 * submitting, or an explicit Secretariat override, does. See ADR-0018 for
 * why this reading (not "3 submissions alone unlocks it") is the one
 * under which §2.6's override action does meaningful work.
 */
export function isScoringThresholdMet(result: SubmissionThresholdResult, scoringOverrideAt: Date | null): boolean {
  return result.status === "ALL_SUBMITTED" || scoringOverrideAt !== null;
}
