export type AssignmentRowReviewer = {
  assignmentId: string;
  slot: string;
  reviewerId: string;
  reviewerName: string;
  assignmentStatus: string;
  reviewStatus: string | null;
  assignedAt: string;
  submittedAt: string | null;
  hasConflict: boolean;
};

export type AssignmentMonitoringRow = {
  applicationId: string;
  applicationNumber: string;
  applicantName: string;
  pathway: string | null;
  reviewers: AssignmentRowReviewer[];
  overallStatus: "AWAITING_ASSIGNMENT" | "NOT_STARTED" | "IN_PROGRESS" | "ESCALATED" | "SUBMITTED";
  hasConflict: boolean;
  hasThirdReview: boolean;
  isOverdue: boolean;
  dueDate: string | null;
  assignedAt: string | null;
};

export type AssignmentMonitoringFilters = {
  page: number;
  pageSize: number;
  reviewerId?: string;
  status?: string;
  pathway?: string;
  overdueOnly?: boolean;
  conflictOnly?: boolean;
  thirdReviewOnly?: boolean;
  assignedFrom?: string;
  assignedTo?: string;
};

export type AssignmentMonitoringResult = {
  total: number;
  rows: AssignmentMonitoringRow[];
  pathwayOptions: string[];
  reviewerOptions: { id: string; name: string }[];
};
