import type { ApplicationStage, EligibilityStatus } from "@/lib/generated/prisma/client";

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  IMPORTED: "Imported",
  UNDER_REVIEW: "Under Review",
  INTERVIEW: "Interview",
  COMMITTEE_REVIEW: "Committee Review",
  EXECUTIVE_APPROVAL: "Executive Approval",
  ADMISSIONS: "Admissions",
  CLOSED: "Closed",
};

export const ELIGIBILITY_LABELS: Record<EligibilityStatus, string> = {
  PENDING: "Pending Screening",
  ELIGIBLE: "Eligible",
  INELIGIBLE: "Ineligible",
  CLARIFICATION_REQUIRED: "Clarification Required",
  DISQUALIFIED: "Disqualified",
};

export const ELIGIBILITY_BADGE_VARIANT: Record<EligibilityStatus, "secondary" | "default" | "destructive" | "outline"> = {
  PENDING: "secondary",
  ELIGIBLE: "default",
  INELIGIBLE: "destructive",
  CLARIFICATION_REQUIRED: "outline",
  DISQUALIFIED: "destructive",
};
