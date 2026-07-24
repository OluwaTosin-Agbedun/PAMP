import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { AccountStatus, Role } from "@/lib/generated/prisma/enums";
import { AuthorisationError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { hasPermission, requirePermission } from "@/lib/permissions/service";
import { ROLES, ROLE_LABELS } from "@/lib/rbac/roles";
import { navGroupsForRole, pinnedNavItemForRole } from "@/lib/navigation";
import { createReview } from "@/modules/reviews/services/reviewService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort, createTestReviewAssignment } from "../helpers/reviewFixtures";

/**
 * Phase 3B.1 — role vocabulary, permission, and navigation reconciliation
 * (docs/ROLE_AND_NAVIGATION_RECONCILIATION.md). These tests exercise the
 * specific boundaries the reconciliation brief calls out by name, on top
 * of the generic role/permission coverage already in
 * tests/unit/rolePermissions.test.ts and tests/integration/permissions.test.ts.
 */
describe("role and navigation reconciliation", () => {
  afterEach(async () => {
    await cleanupTestData();
  });
  afterAll(async () => {
    await cleanupTestData();
  });

  it("the approved role vocabulary is exactly the 9 named operational roles — no Observer, no bare REVIEWER", () => {
    expect(ROLES).toHaveLength(9);
    expect(ROLES).toContain(Role.ELIGIBILITY_REVIEWER);
    expect(ROLES).toContain(Role.APPLICATION_REVIEWER);
    // TypeScript already makes an "OBSERVER" or "REVIEWER" role value
    // impossible to reference (Role is a closed generated enum) — this
    // just asserts the same fact at runtime, against the actual roles
    // this build ships.
    expect(ROLES.map(String)).not.toContain("OBSERVER");
    expect(ROLES.map(String)).not.toContain("REVIEWER");
    expect(ROLE_LABELS[Role.PROGRAMME_SECRETARY]).toBe("Programme Secretary/Admin");
  });

  it("Eligibility Reviewer cannot perform an application review — a real service call, not just a permission-list check", async () => {
    const { user: eligibilityReviewer } = await createTestUser({ role: Role.ELIGIBILITY_REVIEWER });
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      const assignment = await createTestReviewAssignment(application.id, eligibilityReviewer.id);

      await expect(createReview(eligibilityReviewer.id, assignment.id)).rejects.toBeInstanceOf(AuthorisationError);
      expect(await hasPermission(eligibilityReviewer.id, PERMISSIONS.REVIEWS_PERFORM)).toBe(false);
      expect(await hasPermission(eligibilityReviewer.id, PERMISSIONS.REVIEW_SCORES_SUBMIT)).toBe(false);
      void admin;
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("Application Reviewer has no eligibility-decision authority", async () => {
    const { user: applicationReviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });

    await expect(
      requirePermission(applicationReviewer.id, PERMISSIONS.ELIGIBILITY_OVERRIDE_EXECUTE),
    ).rejects.toBeInstanceOf(AuthorisationError);
    expect(await hasPermission(applicationReviewer.id, PERMISSIONS.ELIGIBILITY_REVIEW)).toBe(false);
    // Still has full application-review capability — the split preserved it.
    expect(await hasPermission(applicationReviewer.id, PERMISSIONS.REVIEWS_PERFORM)).toBe(true);
  });

  it("Interviewer cannot access Selection Committee or Executive Approval actions", async () => {
    const { user: interviewer } = await createTestUser({ role: Role.INTERVIEWER });

    await expect(requirePermission(interviewer.id, PERMISSIONS.COMMITTEE_REVIEW)).rejects.toBeInstanceOf(AuthorisationError);
    await expect(requirePermission(interviewer.id, PERMISSIONS.EXECUTIVE_APPROVE)).rejects.toBeInstanceOf(AuthorisationError);
    await expect(requirePermission(interviewer.id, PERMISSIONS.COMMITTEE_VIEW)).rejects.toBeInstanceOf(AuthorisationError);
    await expect(requirePermission(interviewer.id, PERMISSIONS.EXECUTIVE_VIEW)).rejects.toBeInstanceOf(AuthorisationError);
  });

  it("Executive has read-only visibility plus the approve action, nothing else", async () => {
    const { user: executive } = await createTestUser({ role: Role.EXECUTIVE });

    expect(await hasPermission(executive.id, PERMISSIONS.EXECUTIVE_VIEW)).toBe(true);
    expect(await hasPermission(executive.id, PERMISSIONS.EXECUTIVE_APPROVE)).toBe(true);
    expect(await hasPermission(executive.id, PERMISSIONS.REVIEWS_PERFORM)).toBe(false);
    expect(await hasPermission(executive.id, PERMISSIONS.COMMITTEE_REVIEW)).toBe(false);
    expect(await hasPermission(executive.id, PERMISSIONS.ADMISSIONS_MANAGE)).toBe(false);
    expect(await hasPermission(executive.id, PERMISSIONS.USERS_VIEW)).toBe(false);
  });

  it("navigation matches permissions: a role only sees nav groups whose items it's actually permitted to open", async () => {
    const applicationReviewerGroups = navGroupsForRole(Role.APPLICATION_REVIEWER);
    const applicationReviewerIds = applicationReviewerGroups.map((g) => g.id);
    expect(applicationReviewerIds).toContain("applicant-import");
    expect(applicationReviewerIds).toContain("application-review");
    expect(applicationReviewerIds).not.toContain("administration");
    expect(applicationReviewerIds).not.toContain("eligibility-screening");

    const adminGroups = navGroupsForRole(Role.SYSTEM_ADMIN);
    expect(adminGroups.map((g) => g.id)).toEqual([
      "applicant-import",
      "eligibility-screening",
      // Phase 3C shipped the Application Review route — this group's
      // `implemented: true` flip is what makes it appear here now.
      "application-review",
      // Release 1 Module 2 shipped the Interview Workspace route.
      "interview-management",
      // Addendum Modules 4-5 shipped the Final Ranking Workspace inside
      // this taxonomy slot — its `implemented: true` flip is what makes
      // the group appear now (the Selection Committee's own placeholder
      // item, Module 6, is still `implemented: false`).
      "selection-committee",
      // Executive Approval Data Model + Dashboard (Planning Phases 3-4)
      // shipped the /executive-approval route — its `implemented: true`
      // flip is what makes this group appear now.
      "executive-approval",
      // Analytics Aggregation + Dashboard + Reporting (Planning Phase 5)
      // shipped the /reports route — its `implemented: true` flip is
      // what makes this group appear now (the "Admissions" and
      // "Notifications" taxonomy slots between it and Executive
      // Approval both stay `implemented: false`, so they're skipped).
      "reports",
      "administration",
    ]);

    // Fellow has zero permissions — no group renders — but Dashboard
    // remains visible, since it's every active role's unconditional
    // landing page, not permission-gated.
    expect(navGroupsForRole(Role.FELLOW)).toEqual([]);
    expect(pinnedNavItemForRole(Role.FELLOW)?.href).toBe("/dashboard");
  });

  it("direct URL access remains server-protected regardless of navigation visibility (requirePermission, the guard's underlying check, still denies)", async () => {
    const { user: applicationReviewer } = await createTestUser({ role: Role.APPLICATION_REVIEWER });
    // Not shown "Users" in the sidebar (no administration group) — and
    // still denied if they hit /users directly, because
    // requirePagePermission/requireActionPermission both call the exact
    // same permissionsForRole(role).includes(permission) check exercised
    // here, before ever rendering anything.
    await expect(requirePermission(applicationReviewer.id, PERMISSIONS.USERS_VIEW)).rejects.toBeInstanceOf(AuthorisationError);
  });

  it("a user migrated from the old REVIEWER role to APPLICATION_REVIEWER retains valid access, unaffected by inactive/suspended status handling", async () => {
    // Simulates what the Phase 3B.1 migration did to every existing
    // REVIEWER row: only `role` changes, nothing else about the account.
    const { user } = await createTestUser({ role: Role.APPLICATION_REVIEWER, status: AccountStatus.ACTIVE });

    expect(await hasPermission(user.id, PERMISSIONS.REVIEWS_PERFORM)).toBe(true);
    expect(await hasPermission(user.id, PERMISSIONS.REVIEW_SCORES_SUBMIT)).toBe(true);

    // And still correctly blocked the moment their account isn't ACTIVE —
    // the role migration didn't bypass or weaken status enforcement.
    await prisma.user.update({ where: { id: user.id }, data: { status: AccountStatus.SUSPENDED } });
    expect(await hasPermission(user.id, PERMISSIONS.REVIEWS_PERFORM)).toBe(false);
    await expect(requirePermission(user.id, PERMISSIONS.REVIEWS_PERFORM)).rejects.toThrow();
  });
});
