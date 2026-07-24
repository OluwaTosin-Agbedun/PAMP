import { Role } from "@/lib/generated/prisma/enums";

export { Role };

export const ROLES: Role[] = [
  Role.SYSTEM_ADMIN,
  Role.PROGRAMME_DIRECTOR,
  Role.PROGRAMME_SECRETARY,
  Role.ELIGIBILITY_REVIEWER,
  Role.APPLICATION_REVIEWER,
  Role.INTERVIEWER,
  Role.SELECTION_COMMITTEE_MEMBER,
  Role.EXECUTIVE,
  Role.FELLOW,
];

/** Roles a System Administrator is allowed to provision in Version 1. */
export const ASSIGNABLE_ROLES: Role[] = ROLES.filter((role) => role !== Role.FELLOW);

export const ROLE_LABELS: Record<Role, string> = {
  SYSTEM_ADMIN: "System Administrator",
  PROGRAMME_DIRECTOR: "Programme Director",
  PROGRAMME_SECRETARY: "Programme Secretary/Admin",
  ELIGIBILITY_REVIEWER: "Eligibility Reviewer",
  APPLICATION_REVIEWER: "Application Reviewer",
  INTERVIEWER: "Interviewer",
  SELECTION_COMMITTEE_MEMBER: "Selection Committee Member",
  EXECUTIVE: "Executive",
  FELLOW: "Fellow",
};
