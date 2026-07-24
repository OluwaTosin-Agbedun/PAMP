import type { RankingApprovalDecision, RankingApprovalStageType } from "@/lib/generated/prisma/enums";

/**
 * Fixed order of the Programme Identity staged sign-off: Top 70 → Top 60
 * → Final Selection → Verification & Confirmation. A stage can only be
 * decided once the one before it has its most recent decision APPROVED
 * (or, for TOP_70, unconditionally — it's the first gate).
 */
export const APPROVAL_STAGE_ORDER: RankingApprovalStageType[] = [
  "TOP_70",
  "TOP_60",
  "FINAL_SELECTION",
  "VERIFICATION_CONFIRMATION",
];

export const APPROVAL_STAGE_LABELS: Record<RankingApprovalStageType, string> = {
  TOP_70: "Top 70",
  TOP_60: "Top 60",
  FINAL_SELECTION: "Final Selection",
  VERIFICATION_CONFIRMATION: "Verification & Confirmation",
};

export type StageDecisionMap = Map<RankingApprovalStageType, RankingApprovalDecision>;

/** The most recent decision recorded for each stage, keyed by stage. */
export function latestDecisionByStage(
  stages: { stage: RankingApprovalStageType; decision: RankingApprovalDecision; createdAt: Date }[],
): StageDecisionMap {
  const sorted = [...stages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const map: StageDecisionMap = new Map();
  for (const row of sorted) map.set(row.stage, row.decision);
  return map;
}

export type StageDecisionCheck = { allowed: true } | { allowed: false; reason: string };

/**
 * §"Staged approval workflow" — a stage can be (re-)decided only if the
 * stage before it is currently APPROVED, and this stage itself isn't
 * already APPROVED (an approved stage is final; only a REJECTED stage
 * can be re-decided, e.g. after the underlying list is adjusted).
 */
export function canDecideStage(stage: RankingApprovalStageType, latest: StageDecisionMap): StageDecisionCheck {
  const index = APPROVAL_STAGE_ORDER.indexOf(stage);
  if (index > 0) {
    const priorStage = APPROVAL_STAGE_ORDER[index - 1];
    if (latest.get(priorStage) !== "APPROVED") {
      return {
        allowed: false,
        reason: `${APPROVAL_STAGE_LABELS[priorStage]} must be approved before ${APPROVAL_STAGE_LABELS[stage]} can be decided.`,
      };
    }
  }
  if (latest.get(stage) === "APPROVED") {
    return { allowed: false, reason: `${APPROVAL_STAGE_LABELS[stage]} has already been approved.` };
  }
  return { allowed: true };
}

/** `${stage}_${decision}`, e.g. `"TOP_70_APPROVED"` — computed, never user input. */
export function workflowStatusFor(stage: RankingApprovalStageType, decision: RankingApprovalDecision): string {
  return `${stage}_${decision}`;
}

/**
 * The one stage the dashboard should offer a decision form for right
 * now — the first stage in order that `canDecideStage` would currently
 * allow. `null` once every stage is `APPROVED` (the workflow is
 * complete) — there is always at most one actionable stage at a time,
 * since the order is strictly sequential.
 */
export function nextActionableStage(latest: StageDecisionMap): RankingApprovalStageType | null {
  for (const stage of APPROVAL_STAGE_ORDER) {
    if (canDecideStage(stage, latest).allowed) return stage;
  }
  return null;
}

/**
 * Interview Configuration / Programme Identity's fixed staged-narrowing
 * thresholds: the first two gates are literal head-counts (70, then 60)
 * baked into the stage names themselves; the last two both mean "within
 * the cohort's actual target size" (e.g. 30) — Final Selection sets that
 * list, Verification & Confirmation only re-confirms the same one.
 */
export function withinStageBracket(rank: number, stage: RankingApprovalStageType, targetSize: number): boolean {
  switch (stage) {
    case "TOP_70":
      return rank <= 70;
    case "TOP_60":
      return rank <= 60;
    case "FINAL_SELECTION":
    case "VERIFICATION_CONFIRMATION":
      return rank <= targetSize;
  }
}
