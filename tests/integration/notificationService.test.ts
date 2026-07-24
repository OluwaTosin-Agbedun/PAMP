import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/msgraph/mailClient", () => ({
  getMailClient: vi.fn(),
  requireMailClient: vi.fn(),
  isGraphConfigured: vi.fn(() => true),
}));

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { ConflictError } from "@/lib/errors";
import { getMailClient, requireMailClient, type MailSendClient } from "@/lib/msgraph/mailClient";
import {
  cancelNotification,
  enqueueNotification,
  processDueNotifications,
  resendNotification,
  retryNotification,
} from "@/modules/notifications/services/notificationService";

import { cleanupTestData, createTestUser } from "../helpers/db";
import { createTestApplication, createTestProgrammeAndCohort, cleanupReviewFixtures } from "../helpers/reviewFixtures";

/**
 * Notification Infrastructure — every test here runs against a fake
 * `MailSendClient` (never the real HTTP implementation), mirroring the
 * exact discipline `teamsMeetingService.test.ts` established: the
 * automated suite must never call live Microsoft services.
 */

function fakeMailClient(overrides?: Partial<MailSendClient>): MailSendClient {
  return {
    sendMail: vi.fn().mockResolvedValue({ providerMessageId: null }),
    ...overrides,
  };
}

async function enableNotifications(actorId: string) {
  await prisma.systemSetting.upsert({
    where: { key: "feature.notifications" },
    create: { key: "feature.notifications", value: true, updatedById: actorId },
    update: { value: true, updatedById: actorId },
  });
}

const TEST_TEMPLATE_EVENTS = ["ELIGIBLE", "ELIGIBILITY_CLARIFICATION_REQUIRED"];

/**
 * `NotificationTemplate` is global config, not scoped to a test
 * cohort/programme — this deletes any prior version for the event
 * first, so each test starts from a clean slate rather than colliding
 * with a version another test (or a real `npm run db:seed` run) already
 * created. `afterEach` below removes it again, so these tests never
 * leave the real seeded template content overwritten with test copy.
 */
async function seedTemplate(event: string, overrides?: { subject?: string; body?: string }) {
  await prisma.notificationTemplate.deleteMany({ where: { event } });
  return prisma.notificationTemplate.create({
    data: {
      event,
      version: 1,
      subject: overrides?.subject ?? `Subject for ${event}`,
      body: overrides?.body ?? `Hello {{applicantFirstName}}, regarding ${event}.`,
      isActive: true,
    },
  });
}

describe("Notification Infrastructure", () => {
  afterEach(async () => {
    vi.mocked(getMailClient).mockReset();
    vi.mocked(requireMailClient).mockReset();
    await prisma.systemSetting.deleteMany({ where: { key: "feature.notifications" } });
    await prisma.notificationTemplate.deleteMany({ where: { event: { in: TEST_TEMPLATE_EVENTS } } });
    await cleanupTestData();
  });

  it("sends an immediate notification and records it as Sent", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await seedTemplate("ELIGIBLE");
      const { applicant, application } = await createTestApplication(cohort.id);

      const client = fakeMailClient();
      vi.mocked(requireMailClient).mockReturnValue(client);

      const result = await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: application.id,
      });

      expect(client.sendMail).toHaveBeenCalledTimes(1);
      expect(client.sendMail).toHaveBeenCalledWith(expect.objectContaining({ toEmail: applicant.email }));
      expect(result?.status).toBe("SENT");
      expect(result?.sentAt).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({ where: { action: "NOTIFICATION_SENT", entityId: result!.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("never attempts delivery for an invalid or missing email — marks Failed immediately", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await seedTemplate("ELIGIBLE");
      const { applicant, application } = await createTestApplication(cohort.id);

      const client = fakeMailClient();
      vi.mocked(requireMailClient).mockReturnValue(client);

      const result = await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: "" },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: application.id,
      });

      expect(client.sendMail).not.toHaveBeenCalled();
      expect(result?.status).toBe("FAILED");
      expect(result?.failureReason).toMatch(/no valid email/i);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("fails clearly, never silently, when the feature flag is off", async () => {
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await seedTemplate("ELIGIBLE");
      const { applicant, application } = await createTestApplication(cohort.id);

      const client = fakeMailClient();
      vi.mocked(requireMailClient).mockReturnValue(client);

      const result = await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: application.id,
      });

      expect(client.sendMail).not.toHaveBeenCalled();
      expect(result?.status).toBe("FAILED");
      expect(result?.failureReason).toMatch(/disabled/i);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("a real Graph send failure is recorded and retried, never mistaken for success", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await prisma.systemSetting.upsert({
        where: { key: "notification.retry_limit" },
        create: { key: "notification.retry_limit", value: 3, updatedById: admin.id },
        update: { value: 3, updatedById: admin.id },
      });
      await seedTemplate("ELIGIBLE");
      const { applicant, application } = await createTestApplication(cohort.id);

      const client = fakeMailClient({ sendMail: vi.fn().mockRejectedValue(new Error("Graph rejected the message")) });
      vi.mocked(requireMailClient).mockReturnValue(client);

      const result = await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: application.id,
      });

      expect(result?.status).toBe("RETRYING");
      expect(result?.retryCount).toBe(1);

      const audit = await prisma.auditLog.findFirst({ where: { action: "NOTIFICATION_FAILED", entityId: result!.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("prevents a duplicate send for the same event and related entity", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await seedTemplate("ELIGIBLE");
      const { applicant, application } = await createTestApplication(cohort.id);

      const client = fakeMailClient();
      vi.mocked(requireMailClient).mockReturnValue(client);

      const first = await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: application.id,
      });
      const second = await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: application.id,
      });

      expect(second?.id).toBe(first?.id);
      expect(client.sendMail).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("never renders the internal comment into the sent message", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await seedTemplate("ELIGIBILITY_CLARIFICATION_REQUIRED", { body: "Dear {{applicantFirstName}}, {{clarificationReason}}" });
      const { applicant, application } = await createTestApplication(cohort.id);

      const client = fakeMailClient();
      vi.mocked(requireMailClient).mockReturnValue(client);

      await enqueueNotification({
        event: "ELIGIBILITY_CLARIFICATION_REQUIRED",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName, clarificationReason: "Please re-upload your NYSC certificate." },
        internalComment: "Screener suspects this document was altered — flagged for integrity review.",
        applicantFacingComment: "Please re-upload your NYSC certificate.",
        relatedEntityType: "Application",
        relatedEntityId: application.id,
      });

      const call = vi.mocked(client.sendMail).mock.calls[0][0];
      expect(call.body).not.toContain("integrity review");
      expect(call.body).toContain("re-upload your NYSC certificate");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("cancel only works from Pending/Scheduled, not from a terminal state", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await seedTemplate("ELIGIBLE");
      const { applicant, application } = await createTestApplication(cohort.id);

      const client = fakeMailClient();
      vi.mocked(requireMailClient).mockReturnValue(client);

      const sent = await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: application.id,
      });

      await expect(cancelNotification(secretary.id, sent!.id)).rejects.toThrow(ConflictError);

      const scheduled = await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: `${application.id}:other`,
        scheduledFor: new Date(Date.now() + 3_600_000),
      });
      const cancelled = await cancelNotification(secretary.id, scheduled!.id);
      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.cancelledById).toBe(secretary.id);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("retry re-attempts a failed notification and can succeed", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await seedTemplate("ELIGIBLE");
      const { applicant, application } = await createTestApplication(cohort.id);

      // Fails while disabled, producing a genuinely FAILED (not RETRYING) row.
      const client = fakeMailClient();
      vi.mocked(requireMailClient).mockReturnValue(client);
      await prisma.systemSetting.update({ where: { key: "feature.notifications" }, data: { value: false } });

      const failed = await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: application.id,
      });
      expect(failed?.status).toBe("FAILED");

      await prisma.systemSetting.update({ where: { key: "feature.notifications" }, data: { value: true } });
      const retried = await retryNotification(secretary.id, failed!.id);

      expect(retried?.status).toBe("SENT");
      const audit = await prisma.auditLog.findFirst({ where: { action: "NOTIFICATION_RETRIED", entityId: failed!.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("resend creates a fresh row and can be used even after a successful send", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await seedTemplate("ELIGIBLE");
      const { applicant, application } = await createTestApplication(cohort.id);

      const client = fakeMailClient();
      vi.mocked(requireMailClient).mockReturnValue(client);

      const original = await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: application.id,
      });
      expect(original?.status).toBe("SENT");

      const resent = await resendNotification(secretary.id, original!.id);

      expect(resent?.id).not.toBe(original!.id);
      expect(resent?.status).toBe("SENT");
      expect(client.sendMail).toHaveBeenCalledTimes(2);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("processDueNotifications only picks up rows actually due", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await seedTemplate("ELIGIBLE");
      const { applicant, application } = await createTestApplication(cohort.id);

      const client = fakeMailClient();
      vi.mocked(requireMailClient).mockReturnValue(client);

      // A future-scheduled row — not due yet.
      await enqueueNotification({
        event: "ELIGIBLE",
        recipient: { type: "APPLICANT", applicantId: applicant.id, email: applicant.email },
        variables: { applicantFirstName: applicant.firstName },
        relatedEntityType: "Application",
        relatedEntityId: application.id,
        scheduledFor: new Date(Date.now() + 3_600_000),
      });

      const before = await processDueNotifications();
      expect(before.processed).toBe(0);
      expect(client.sendMail).not.toHaveBeenCalled();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
