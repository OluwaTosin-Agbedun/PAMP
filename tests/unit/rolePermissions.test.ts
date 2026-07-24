import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { permissionsForRole } from "@/lib/permissions/rolePermissions";
import { Role } from "@/lib/rbac/roles";

describe("permissionsForRole", () => {
  it("grants the Fellow role no permissions (no module access until the Fellow Portal ships)", () => {
    expect(permissionsForRole(Role.FELLOW)).toEqual([]);
  });

  it("grants System Administrator every permission in the catalogue", () => {
    const granted = permissionsForRole(Role.SYSTEM_ADMIN);
    for (const permission of Object.values(PERMISSIONS)) {
      expect(granted).toContain(permission);
    }
  });

  it("grants Application Reviewer application review permissions but not user administration or eligibility oversight", () => {
    const granted = permissionsForRole(Role.APPLICATION_REVIEWER);
    expect(granted).toContain(PERMISSIONS.APPLICATIONS_VIEW);
    expect(granted).toContain(PERMISSIONS.REVIEWS_PERFORM);
    expect(granted).not.toContain(PERMISSIONS.USERS_VIEW);
    expect(granted).not.toContain(PERMISSIONS.USERS_MANAGE_ROLES);
    // Phase 3B.1: the REVIEWER split — an Application Reviewer has no
    // eligibility-decision authority (see docs/ROLE_AND_NAVIGATION_RECONCILIATION.md).
    expect(granted).not.toContain(PERMISSIONS.ELIGIBILITY_REVIEW);
  });

  it("grants Eligibility Reviewer read-only eligibility oversight, no scoring capability", () => {
    const granted = permissionsForRole(Role.ELIGIBILITY_REVIEWER);
    expect(granted).toContain(PERMISSIONS.APPLICATIONS_VIEW);
    expect(granted).toContain(PERMISSIONS.ELIGIBILITY_REVIEW);
    expect(granted).not.toContain(PERMISSIONS.REVIEWS_PERFORM);
    expect(granted).not.toContain(PERMISSIONS.REVIEW_SCORES_SUBMIT);
    expect(granted).not.toContain(PERMISSIONS.USERS_VIEW);
  });

  it("grants Programme Secretary read-only visibility into Executive Approval, never the approve action", () => {
    const granted = permissionsForRole(Role.PROGRAMME_SECRETARY);
    expect(granted).toContain(PERMISSIONS.EXECUTIVE_VIEW);
    expect(granted).not.toContain(PERMISSIONS.EXECUTIVE_APPROVE);
  });

  it("grants Executive the approve action but not global admissions management", () => {
    const granted = permissionsForRole(Role.EXECUTIVE);
    expect(granted).toContain(PERMISSIONS.EXECUTIVE_APPROVE);
    expect(granted).not.toContain(PERMISSIONS.ADMISSIONS_MANAGE);
  });

  it("keeps every non-admin role's permission set free of user-administration permissions", () => {
    const userAdminPermissions = [
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_MANAGE_STATUS,
      PERMISSIONS.USERS_MANAGE_ROLES,
      PERMISSIONS.USERS_RESET_PASSWORD,
    ];
    const nonAdminRoles = Object.values(Role).filter((role) => role !== Role.SYSTEM_ADMIN);

    for (const role of nonAdminRoles) {
      const granted = permissionsForRole(role);
      for (const permission of userAdminPermissions) {
        expect(granted).not.toContain(permission);
      }
    }
  });
});
