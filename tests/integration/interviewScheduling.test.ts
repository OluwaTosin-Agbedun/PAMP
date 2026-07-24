import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/msgraph/mailClient", () => ({
  getMailClient: vi.fn(),
  requireMailClient: vi.fn(),
  isGraphConfigured: vi.fn(() => true),
}));

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { requireMailClient, type MailSendClient } from "@/lib/msgraph/mailClient";
import {
  bookSlot,
  confirmBooking,
  declineBooking,
  generateSlotsForInterview,
  getBookingPageData,
  publishSlots,
  recordAttendance,
  removeAvailability,
  sendDueReminders,
  sendInvitations,
  setTeamsLink,
  submitAvailability,
} from "@/modules/interviews/services/schedulingService";
import { cleanupTestData, createTestUser } from "../helpers/db";
import { cleanupReviewFixtures, createTestApplication, createTestProgrammeAndCohort } from "../helpers/reviewFixtures";

function fakeMailClient(): MailSendClient {
  return { sendMail: vi.fn().mockResolvedValue({ providerMessageId: null }) };
}

async function enableNotifications(actorId: string) {
  await prisma.systemSetting.upsert({
    where: { key: "feature.notifications" },
    create: { key: "feature.notifications", value: true, updatedById: actorId },
    update: { value: true, updatedById: actorId },
  });
}

describe("Release 1 — Interview Scheduling", () => {
  afterEach(async () => {
    vi.mocked(requireMailClient).mockReset();
    await prisma.systemSetting.deleteMany({ where: { key: "feature.notifications" } });
    await cleanupTestData();
  });

  it("submitAvailability persists a window and removeAvailability deletes only the caller's own row", async () => {
    const { user: interviewer } = await createTestUser({ role: Role.INTERVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const row = await submitAvailability(interviewer.id, {
        cohortId: cohort.id,
        type: "AVAILABLE",
        startsAt: new Date(Date.now() + 3600_000).toISOString(),
        endsAt: new Date(Date.now() + 7200_000).toISOString(),
      });
      expect(row.interviewerId).toBe(interviewer.id);

      const { user: otherInterviewer } = await createTestUser({ role: Role.INTERVIEWER });
      await expect(removeAvailability(otherInterviewer.id, row.id)).rejects.toBeInstanceOf(NotFoundError);

      await removeAvailability(interviewer.id, row.id);
      const remaining = await prisma.interviewerAvailability.findUnique({ where: { id: row.id } });
      expect(remaining).toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("submitAvailability rejects UNAVAILABLE/LEAVE without a reason and a start after end", async () => {
    const { user: interviewer } = await createTestUser({ role: Role.INTERVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await expect(
        submitAvailability(interviewer.id, {
          cohortId: cohort.id,
          type: "LEAVE",
          startsAt: new Date(Date.now() + 3600_000).toISOString(),
          endsAt: new Date(Date.now() + 7200_000).toISOString(),
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        submitAvailability(interviewer.id, {
          cohortId: cohort.id,
          type: "AVAILABLE",
          startsAt: new Date(Date.now() + 7200_000).toISOString(),
          endsAt: new Date(Date.now() + 3600_000).toISOString(),
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("the full scheduling flow: generate slots -> publish -> applicant books -> Secretariat confirms -> Teams link -> invitations -> reminders", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      const interview = await prisma.interview.create({ data: { applicationId: application.id, cohortId: cohort.id, scheduledAt: null } });

      const interviewers = await Promise.all(Array.from({ length: 4 }, () => createTestUser({ role: Role.INTERVIEWER })));
      for (const { user } of interviewers) {
        await prisma.interviewPanelist.create({ data: { interviewId: interview.id, userId: user.id, assignedMethod: "MANUAL", status: "ASSIGNED" } });
      }

      const windowStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const windowEnd = new Date(windowStart.getTime() + 2 * 60 * 60 * 1000);
      for (const { user } of interviewers) {
        await submitAvailability(user.id, {
          cohortId: cohort.id,
          type: "AVAILABLE",
          startsAt: windowStart.toISOString(),
          endsAt: windowEnd.toISOString(),
        });
      }

      const generated = await generateSlotsForInterview(admin.id, interview.id);
      expect(generated.candidateCount).toBeGreaterThan(0);

      const published = await publishSlots(admin.id, interview.id);
      expect(published.bookingPath).toMatch(/^\/interview\/book\//);
      const token = published.bookingPath.split("/").pop()!;

      const pageData = await getBookingPageData(token);
      expect(pageData.candidateSlots.length).toBeGreaterThan(0);
      const slotId = pageData.candidateSlots[0].id;

      await bookSlot(token, slotId);
      const afterBooking = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
      expect(afterBooking.bookingStatus).toBe("PENDING_CONFIRMATION");
      expect(afterBooking.selectedSlotId).toBe(slotId);

      // "Applicants may never hold multiple interview bookings."
      const otherSlotId = pageData.candidateSlots[1]?.id;
      if (otherSlotId) {
        await expect(bookSlot(token, otherSlotId)).rejects.toBeInstanceOf(ConflictError);
      }

      await confirmBooking(admin.id, interview.id);
      const afterConfirm = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
      expect(afterConfirm.bookingStatus).toBe("CONFIRMED");
      expect(afterConfirm.scheduledAt).not.toBeNull();

      await expect(setTeamsLink(admin.id, interview.id, "not-a-url")).rejects.toBeInstanceOf(ValidationError);
      await setTeamsLink(admin.id, interview.id, "https://teams.microsoft.com/l/meetup-join/abc");

      await expect(sendInvitations(admin.id, interview.id)).resolves.toBeUndefined();
      const afterInvitations = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
      expect(afterInvitations.invitationsSentAt).not.toBeNull();

      const inviteAudit = await prisma.auditLog.findFirst({ where: { action: "INTERVIEW_INVITATIONS_SENT", entityId: interview.id } });
      expect(inviteAudit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("declineBooking resets the interview so the applicant can pick a different slot", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      const interview = await prisma.interview.create({ data: { applicationId: application.id, cohortId: cohort.id, scheduledAt: null } });
      const interviewers = await Promise.all(Array.from({ length: 4 }, () => createTestUser({ role: Role.INTERVIEWER })));
      for (const { user } of interviewers) {
        await prisma.interviewPanelist.create({ data: { interviewId: interview.id, userId: user.id, assignedMethod: "MANUAL", status: "ASSIGNED" } });
      }
      const windowStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const windowEnd = new Date(windowStart.getTime() + 2 * 60 * 60 * 1000);
      for (const { user } of interviewers) {
        await submitAvailability(user.id, { cohortId: cohort.id, type: "AVAILABLE", startsAt: windowStart.toISOString(), endsAt: windowEnd.toISOString() });
      }
      await generateSlotsForInterview(admin.id, interview.id);
      const published = await publishSlots(admin.id, interview.id);
      const token = published.bookingPath.split("/").pop()!;
      const pageData = await getBookingPageData(token);
      const slotId = pageData.candidateSlots[0].id;
      await bookSlot(token, slotId);

      await declineBooking(admin.id, interview.id, "Panellist raised a scheduling conflict.");

      const reset = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
      expect(reset.bookingStatus).toBe("SLOTS_PUBLISHED");
      expect(reset.selectedSlotId).toBeNull();

      const cancelledSlot = await prisma.interviewSlot.findUniqueOrThrow({ where: { id: slotId } });
      expect(cancelledSlot.status).toBe("CANCELLED");

      // Applicant can now book a different still-OPEN slot.
      const stillOpen = await prisma.interviewSlot.findFirst({ where: { interviewId: interview.id, status: "OPEN" } });
      if (stillOpen) {
        await expect(bookSlot(token, stillOpen.id)).resolves.toEqual({ confirmed: false });
      }
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("denies interview_scheduling.manage to an Interviewer", async () => {
    const { user: interviewer } = await createTestUser({ role: Role.INTERVIEWER });
    const { programme } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication((await prisma.cohort.findFirstOrThrow({ where: { programmeId: programme.id } })).id);
      const interview = await prisma.interview.create({ data: { applicationId: application.id, cohortId: application.cohortId, scheduledAt: null } });

      await expect(generateSlotsForInterview(interviewer.id, interview.id)).rejects.toBeInstanceOf(AuthorisationError);
      await expect(confirmBooking(interviewer.id, interview.id)).rejects.toBeInstanceOf(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("sendDueReminders records a reminder once a configured threshold is crossed, and is idempotent", async () => {
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      const { user: interviewer } = await createTestUser({ role: Role.INTERVIEWER });
      const scheduledAt = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23h out — crosses the default 24h threshold

      const interview = await prisma.interview.create({
        data: {
          applicationId: application.id,
          cohortId: cohort.id,
          scheduledAt,
          bookingStatus: "CONFIRMED",
          invitationsSentAt: new Date(),
        },
      });
      await prisma.interviewPanelist.create({ data: { interviewId: interview.id, userId: interviewer.id, assignedMethod: "MANUAL", status: "ASSIGNED" } });

      const first = await sendDueReminders();
      expect(first.remindersSent).toBeGreaterThanOrEqual(1);

      const second = await sendDueReminders();
      expect(second.remindersSent).toBe(0);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("Interview Configuration §6/§4.6 — recordAttendance sets the status and audits who recorded it", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: interviewer } = await createTestUser({ role: Role.INTERVIEWER });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      const { application } = await createTestApplication(cohort.id);
      const interview = await prisma.interview.create({
        data: { applicationId: application.id, cohortId: cohort.id, bookingStatus: "CONFIRMED", scheduledAt: new Date() },
      });
      await prisma.interviewPanelist.create({ data: { interviewId: interview.id, userId: interviewer.id, assignedMethod: "MANUAL", status: "ASSIGNED" } });

      await expect(recordAttendance(interviewer.id, interview.id, "PRESENT")).rejects.toBeInstanceOf(AuthorisationError);

      await recordAttendance(admin.id, interview.id, "LATE", "Joined 8 minutes late.");

      const updated = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
      expect(updated.attendanceStatus).toBe("LATE");
      expect(updated.attendanceNote).toBe("Joined 8 minutes late.");
      expect(updated.attendanceRecordedById).toBe(admin.id);
      expect(updated.attendanceRecordedAt).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({ where: { action: "INTERVIEW_ATTENDANCE_RECORDED", entityId: interview.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("sendInvitations enqueues a real INTERVIEW_INVITATION notification alongside the existing audit record", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await prisma.notificationTemplate.deleteMany({ where: { event: "INTERVIEW_INVITATION" } });
      await prisma.notificationTemplate.create({
        data: { event: "INTERVIEW_INVITATION", version: 1, isActive: true, subject: "Your interview", body: "Hi {{applicantFirstName}}, join at {{joinLink}}." },
      });

      const client = fakeMailClient();
      vi.mocked(requireMailClient).mockReturnValue(client);

      const { applicant, application } = await createTestApplication(cohort.id);
      const interview = await prisma.interview.create({
        data: {
          applicationId: application.id,
          cohortId: cohort.id,
          bookingStatus: "CONFIRMED",
          scheduledAt: new Date(Date.now() + 86_400_000),
          teamsLink: "https://teams.microsoft.com/l/meetup-join/abc",
        },
      });

      await sendInvitations(admin.id, interview.id);

      expect(client.sendMail).toHaveBeenCalledTimes(1);
      const call = vi.mocked(client.sendMail).mock.calls[0][0];
      expect(call.toEmail).toBe(applicant.email);
      expect(call.body).toContain("https://teams.microsoft.com/l/meetup-join/abc");

      const notification = await prisma.outboundNotification.findFirst({ where: { event: "INTERVIEW_INVITATION", relatedEntityId: interview.id } });
      expect(notification?.status).toBe("SENT");
    } finally {
      // cleanupReviewFixtures first — it cascade-deletes the OutboundNotification
      // row (via the test Applicant), which must happen before the
      // NotificationTemplate it references can be deleted.
      await cleanupReviewFixtures(programme.id);
      await prisma.notificationTemplate.deleteMany({ where: { event: "INTERVIEW_INVITATION" } });
    }
  });

  it("sendInvitations still succeeds even if the notification template is missing — never blocks the actual invitation", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { programme, cohort } = await createTestProgrammeAndCohort();
    try {
      await enableNotifications(admin.id);
      await prisma.notificationTemplate.deleteMany({ where: { event: "INTERVIEW_INVITATION" } });

      const { application } = await createTestApplication(cohort.id);
      const interview = await prisma.interview.create({
        data: {
          applicationId: application.id,
          cohortId: cohort.id,
          bookingStatus: "CONFIRMED",
          scheduledAt: new Date(Date.now() + 86_400_000),
          teamsLink: "https://teams.microsoft.com/l/meetup-join/abc",
        },
      });

      await expect(sendInvitations(admin.id, interview.id)).resolves.toBeUndefined();

      const updated = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
      expect(updated.invitationsSentAt).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
