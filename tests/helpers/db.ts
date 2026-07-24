import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db/prisma";
import { AccountStatus, Role } from "@/lib/generated/prisma/enums";

/**
 * Every test user lives on this domain so cleanup can scope precisely to
 * rows the test suite created, never touching real seed/dev data in the
 * same local Postgres instance (see docs/... integration test notes).
 */
export const TEST_EMAIL_DOMAIN = "@test.pam-p.invalid";

export function testEmail(label: string): string {
  return `${label}-${randomUUID()}${TEST_EMAIL_DOMAIN}`;
}

export const TEST_PASSWORD = "Correct-Horse9!";

export async function createTestUser(overrides?: {
  email?: string;
  name?: string;
  role?: Role;
  status?: AccountStatus;
  password?: string;
  mustChangePassword?: boolean;
}) {
  const password = overrides?.password ?? TEST_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name: overrides?.name ?? "Test User",
      email: overrides?.email ?? testEmail("user"),
      role: overrides?.role ?? Role.APPLICATION_REVIEWER,
      status: overrides?.status ?? AccountStatus.ACTIVE,
      passwordHash,
      mustChangePassword: overrides?.mustChangePassword ?? false,
    },
  });

  return { user, password };
}

/**
 * Deletes every User created under the test email domain, plus every
 * AuditLog row tied to one of those users (actorId/entityId) or — for
 * failed-login audits, which have no user row to key off of — whose
 * metadata mentions a test email directly (see authorizeCredentials'
 * "unknown_user" audit entry, written before any user lookup succeeds).
 */
export async function cleanupTestData() {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN } },
    select: { id: true },
  });
  const ids = testUsers.map((u) => u.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        ...(ids.length > 0 ? [{ actorId: { in: ids } }, { entityId: { in: ids } }] : []),
        { metadata: { path: ["email"], string_contains: TEST_EMAIL_DOMAIN } },
      ],
    },
  });

  if (ids.length > 0) {
    // RankingSnapshot.generatedById has no onDelete:Cascade (it's an
    // immutable historical record — see its doc comment) — a snapshot a
    // test admin generated would otherwise block their own deletion here.
    // Normally `cleanupReviewFixtures` already removes it by cohortId
    // first, but this is a defensive fallback for any test that doesn't
    // route through that helper.
    await prisma.rankingSnapshot.deleteMany({ where: { generatedById: { in: ids } } });
    // InterviewerAvailability.interviewerId has no onDelete:Cascade
    // (default RESTRICT) — same defensive-fallback reasoning as
    // rankingSnapshot above; cleanupReviewFixtures normally removes it
    // by cohortId first.
    await prisma.interviewerAvailability.deleteMany({ where: { interviewerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}
