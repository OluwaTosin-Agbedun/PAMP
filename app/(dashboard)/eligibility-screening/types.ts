import type { ChecklistSection, ChecklistItemStatus, ScreeningNextAction, ScreeningStatus } from "@/lib/generated/prisma/client";

export const SCREENING_STATUS_LABELS: Record<ScreeningStatus, string> = {
  PENDING_SCREENING: "Pending Screening",
  IN_PROGRESS: "Screening In Progress",
  CLARIFICATION_REQUIRED: "Clarification Required",
  ESCALATED: "Escalated",
  ELIGIBLE: "Eligible",
  INELIGIBLE: "Ineligible",
  DISQUALIFIED: "Disqualified",
};

export const SCREENING_STATUS_BADGE_VARIANT: Record<ScreeningStatus, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING_SCREENING: "secondary",
  IN_PROGRESS: "outline",
  CLARIFICATION_REQUIRED: "outline",
  ESCALATED: "destructive",
  ELIGIBLE: "default",
  INELIGIBLE: "destructive",
  DISQUALIFIED: "destructive",
};

export const NEXT_ACTION_LABELS: Record<ScreeningNextAction, string> = {
  PROCEED: "Proceed to Application Review",
  CLARIFY: "Request Clarification",
  REJECT: "Reject",
  ESCALATE: "Escalate",
};

export const CHECKLIST_ITEM_STATUS_LABELS: Record<ChecklistItemStatus, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  CLARIFY: "Clarify",
  CLEAR: "Clear",
  FLAG: "Flag",
};

export type ScreeningListRowViewModel = {
  applicationId: string;
  applicantName: string;
  status: ScreeningStatus;
  screenerName: string | null;
  dateReviewed: string | null;
};

export type ChecklistItemViewModel = {
  section: ChecklistSection;
  itemKey: string;
  label: string;
  evidence: string;
  status: ChecklistItemStatus | null;
  comment: string | null;
  isAutomatic: boolean;
  updatedByName: string | null;
};
