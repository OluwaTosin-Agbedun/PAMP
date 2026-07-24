import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/msgraph/client", () => ({
  getGraphClient: vi.fn(),
  getGraphOrganiserUpn: vi.fn(() => "interviews@pamp.invalid"),
  isGraphConfigured: vi.fn(() => true),
}));

import { prisma } from "@/lib/db/prisma";
import { Role } from "@/lib/generated/prisma/client";
import { AuthorisationError, GraphNotConfiguredError } from "@/lib/errors";
import { getGraphClient, type GraphMeetingClient } from "@/lib/msgraph/client";
import { autoAssignPanel, scheduleInterview } from "@/modules/interviews/services/panelAssignmentService";
import {
  cancelInterview,
  createOrSyncTeamsMeeting,
  rescheduleInterview,
  retryTeamsMeetingSync,
} from "@/modules/interviews/services/teamsMeetingService";

import { cleanupTestData, createTestUser } from "../helpers/db";
import { createTestApplication, createTestProgrammeAndCohort, cleanupReviewFixtures } from "../helpers/reviewFixtures";

/**
 * Microsoft Teams Interview Integration — every test here runs against
 * a fake `GraphMeetingClient` (never the real HTTP implementation), per
 * the brief's "must never call live Microsoft services in the normal
 * test suite" (§18.3). The fake is swapped in per-test via `getGraphClient`.
 */

function fakeClient(overrides?: Partial<GraphMeetingClient>): GraphMeetingClient {
  return {
    createMeeting: vi.fn().mockResolvedValue({ graphEventId: "evt-1", joinUrl: "https://teams.microsoft.com/l/meetup-join/evt-1" }),
    updateMeeting: vi.fn().mockResolvedValue({ graphEventId: "evt-1", joinUrl: "https://teams.microsoft.com/l/meetup-join/evt-1" }),
    cancelMeeting: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function setUpConfirmedInterview(adminId: string) {
  const { programme, cohort } = await createTestProgrammeAndCohort();
  await Promise.all(Array.from({ length: 4 }, () => createTestUser({ role: Role.INTERVIEWER })));
  const { application } = await createTestApplication(cohort.id);
  const interview = await scheduleInterview(adminId, cohort.id, {
    applicationId: application.id,
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await autoAssignPanel(interview.id);
  await prisma.interview.update({ where: { id: interview.id }, data: { bookingStatus: "CONFIRMED" } });
  return { programme, cohort, application, interview };
}

describe("Microsoft Teams Interview Integration", () => {
  afterEach(async () => {
    vi.mocked(getGraphClient).mockReset();
    await cleanupTestData();
  });

  it("creates a real Teams meeting and stores the join link", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, interview } = await setUpConfirmedInterview(admin.id);
    try {
      const client = fakeClient();
      vi.mocked(getGraphClient).mockReturnValue(client);

      await createOrSyncTeamsMeeting(secretary.id, interview.id);

      expect(client.createMeeting).toHaveBeenCalledTimes(1);
      const meeting = await prisma.interviewTeamsMeeting.findUniqueOrThrow({ where: { interviewId: interview.id } });
      expect(meeting.syncStatus).toBe("SYNCED");
      expect(meeting.joinUrl).toBe("https://teams.microsoft.com/l/meetup-join/evt-1");
      expect(meeting.graphEventId).toBe("evt-1");

      const audit = await prisma.auditLog.findFirst({ where: { action: "INTERVIEW_TEAMS_MEETING_CREATED", entityId: interview.id } });
      expect(audit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("rejects a role without the create-meeting permission", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: interviewer } = await createTestUser({ role: Role.INTERVIEWER });
    const { programme, interview } = await setUpConfirmedInterview(admin.id);
    try {
      vi.mocked(getGraphClient).mockReturnValue(fakeClient());
      await expect(createOrSyncTeamsMeeting(interviewer.id, interview.id)).rejects.toThrow(AuthorisationError);
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("regression: never reports success when Microsoft Graph isn't configured — records FAILED and throws", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, interview } = await setUpConfirmedInterview(admin.id);
    try {
      vi.mocked(getGraphClient).mockReturnValue(null);

      await expect(createOrSyncTeamsMeeting(secretary.id, interview.id)).rejects.toThrow(GraphNotConfiguredError);

      const meeting = await prisma.interviewTeamsMeeting.findUniqueOrThrow({ where: { interviewId: interview.id } });
      expect(meeting.syncStatus).toBe("FAILED");
      expect(meeting.joinUrl).toBeNull();
      expect(meeting.failureReason).toBeTruthy();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("regression: a Graph error is never swallowed — persists FAILED, increments retryCount, and rethrows", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, interview } = await setUpConfirmedInterview(admin.id);
    try {
      const client = fakeClient({ createMeeting: vi.fn().mockRejectedValue(new Error("Graph rejected the request: 503")) });
      vi.mocked(getGraphClient).mockReturnValue(client);

      await expect(createOrSyncTeamsMeeting(secretary.id, interview.id)).rejects.toThrow("Graph rejected the request: 503");

      const meeting = await prisma.interviewTeamsMeeting.findUniqueOrThrow({ where: { interviewId: interview.id } });
      expect(meeting.syncStatus).toBe("FAILED");
      expect(meeting.retryCount).toBe(1);
      expect(meeting.failureReason).toContain("503");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("retry requires a prior failed sync, and clears the failure once it succeeds", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, interview } = await setUpConfirmedInterview(admin.id);
    try {
      await expect(retryTeamsMeetingSync(secretary.id, interview.id)).rejects.toThrow();

      vi.mocked(getGraphClient).mockReturnValue(fakeClient({ createMeeting: vi.fn().mockRejectedValue(new Error("timeout")) }));
      await expect(createOrSyncTeamsMeeting(secretary.id, interview.id)).rejects.toThrow();

      const client = fakeClient();
      vi.mocked(getGraphClient).mockReturnValue(client);
      await retryTeamsMeetingSync(secretary.id, interview.id);

      expect(client.createMeeting).toHaveBeenCalledTimes(1);
      const meeting = await prisma.interviewTeamsMeeting.findUniqueOrThrow({ where: { interviewId: interview.id } });
      expect(meeting.syncStatus).toBe("SYNCED");
      expect(meeting.failureReason).toBeNull();

      const retryAudit = await prisma.auditLog.findFirst({ where: { action: "INTERVIEW_TEAMS_SYNC_RETRIED", entityId: interview.id } });
      expect(retryAudit).not.toBeNull();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("reschedule updates the same Graph event — never creates a second meeting", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, interview } = await setUpConfirmedInterview(admin.id);
    try {
      const client = fakeClient();
      vi.mocked(getGraphClient).mockReturnValue(client);
      await createOrSyncTeamsMeeting(secretary.id, interview.id);

      const newTime = new Date(Date.now() + 2 * 86_400_000);
      const result = await rescheduleInterview(secretary.id, interview.id, newTime, "Panellist conflict.");

      expect(result.teamsSynced).toBe(true);
      expect(client.createMeeting).toHaveBeenCalledTimes(1); // still only once
      expect(client.updateMeeting).toHaveBeenCalledTimes(1);
      expect(client.updateMeeting).toHaveBeenCalledWith("evt-1", expect.anything());

      const reloaded = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
      expect(reloaded.scheduledAt?.getTime()).toBe(newTime.getTime());
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("reschedule still saves the new time even when the Graph re-sync fails — reported, not swallowed", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, interview } = await setUpConfirmedInterview(admin.id);
    try {
      vi.mocked(getGraphClient).mockReturnValue(fakeClient());
      await createOrSyncTeamsMeeting(secretary.id, interview.id);

      vi.mocked(getGraphClient).mockReturnValue(fakeClient({ updateMeeting: vi.fn().mockRejectedValue(new Error("Graph is down")) }));
      const newTime = new Date(Date.now() + 3 * 86_400_000);
      const result = await rescheduleInterview(secretary.id, interview.id, newTime, "Room unavailable.");

      expect(result.rescheduled).toBe(true);
      expect(result.teamsSynced).toBe(false);
      expect(result.teamsSyncError).toContain("Graph is down");

      const reloaded = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
      expect(reloaded.scheduledAt?.getTime()).toBe(newTime.getTime());
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("cancelling an interview cancels its synced Teams meeting and never duplicates a cancellation", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, interview } = await setUpConfirmedInterview(admin.id);
    try {
      const client = fakeClient();
      vi.mocked(getGraphClient).mockReturnValue(client);
      await createOrSyncTeamsMeeting(secretary.id, interview.id);

      const result = await cancelInterview(secretary.id, interview.id, "Applicant withdrew.");

      expect(result.cancelled).toBe(true);
      expect(result.teamsMeetingCancelled).toBe(true);
      expect(client.cancelMeeting).toHaveBeenCalledWith("evt-1");

      const reloadedInterview = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
      expect(reloadedInterview.status).toBe("CANCELLED");
      const meeting = await prisma.interviewTeamsMeeting.findUniqueOrThrow({ where: { interviewId: interview.id } });
      expect(meeting.syncStatus).toBe("CANCELLED");

      await expect(cancelInterview(secretary.id, interview.id, "Already cancelled.")).rejects.toThrow();
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });

  it("cancelling still ends the interview even if the Graph cancellation itself fails — reported, not hidden", async () => {
    const { user: admin } = await createTestUser({ role: Role.SYSTEM_ADMIN });
    const { user: secretary } = await createTestUser({ role: Role.PROGRAMME_SECRETARY });
    const { programme, interview } = await setUpConfirmedInterview(admin.id);
    try {
      vi.mocked(getGraphClient).mockReturnValue(fakeClient());
      await createOrSyncTeamsMeeting(secretary.id, interview.id);

      vi.mocked(getGraphClient).mockReturnValue(fakeClient({ cancelMeeting: vi.fn().mockRejectedValue(new Error("Graph unreachable")) }));
      const result = await cancelInterview(secretary.id, interview.id, "Programme cancelled.");

      expect(result.cancelled).toBe(true);
      expect(result.teamsMeetingCancelled).toBe(false);
      expect(result.teamsCancelError).toContain("Graph unreachable");

      const reloadedInterview = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
      expect(reloadedInterview.status).toBe("CANCELLED");
    } finally {
      await cleanupReviewFixtures(programme.id);
    }
  });
});
