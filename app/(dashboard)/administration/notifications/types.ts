export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  SCHEDULED: "Scheduled",
  PROCESSING: "Processing",
  SENT: "Sent",
  FAILED: "Failed",
  RETRYING: "Retrying",
  CANCELLED: "Cancelled",
};

export const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  SCHEDULED: "outline",
  PROCESSING: "outline",
  SENT: "default",
  FAILED: "destructive",
  RETRYING: "outline",
  CANCELLED: "secondary",
};
