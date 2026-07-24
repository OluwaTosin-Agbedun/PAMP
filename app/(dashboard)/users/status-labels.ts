import { AccountStatus } from "@/lib/generated/prisma/enums";

export const STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
  PENDING_ACTIVATION: "Pending activation",
  LOCKED: "Locked",
};

export const STATUS_BADGE_VARIANT: Record<AccountStatus, "secondary" | "outline" | "destructive"> = {
  ACTIVE: "secondary",
  INACTIVE: "outline",
  SUSPENDED: "destructive",
  PENDING_ACTIVATION: "outline",
  LOCKED: "destructive",
};

export const ASSIGNABLE_STATUSES: AccountStatus[] = [
  AccountStatus.ACTIVE,
  AccountStatus.INACTIVE,
  AccountStatus.SUSPENDED,
  AccountStatus.PENDING_ACTIVATION,
  AccountStatus.LOCKED,
];
