import "server-only";

import { logger } from "@/lib/logging/logger";
import { GraphNotConfiguredError, TeamsMeetingSyncError } from "@/lib/errors";

import { getAccessToken, isGraphConfigured, parseGraphError, readGraphConfig, type GraphConfig } from "./token";

export { isGraphConfigured };

/**
 * Microsoft Teams Interview Integration — the one place that talks to
 * Microsoft Graph's calendar/events API. Shared tenant authentication
 * lives in `./token.ts` (also used by `./mailClient.ts` for outbound
 * notification email) — this file owns only the Teams-meeting-shaped
 * request/response mapping.
 *
 * `GraphMeetingClient` is the seam `teamsMeetingService.ts` depends on,
 * not this file's concrete implementation directly — tests inject a
 * mock implementing the same interface, so the automated suite never
 * makes a real network call to Microsoft (§18.3).
 */

export type TeamsMeetingRequest = {
  subject: string;
  /** ISO 8601, no offset — paired with `timeZone` per Graph's dateTimeTimeZone convention. */
  startDateTime: string;
  endDateTime: string;
  /** IANA/Windows time zone name Graph accepts, e.g. "Africa/Lagos". */
  timeZone: string;
  attendeeEmails: string[];
};

export type TeamsMeetingResult = {
  graphEventId: string;
  joinUrl: string;
};

export interface GraphMeetingClient {
  createMeeting(request: TeamsMeetingRequest): Promise<TeamsMeetingResult>;
  updateMeeting(graphEventId: string, request: TeamsMeetingRequest): Promise<TeamsMeetingResult>;
  cancelMeeting(graphEventId: string): Promise<void>;
}

export function getGraphOrganiserUpn(): string | null {
  return readGraphConfig()?.organiserUpn ?? null;
}

function toGraphEvent(request: TeamsMeetingRequest) {
  return {
    subject: request.subject,
    start: { dateTime: request.startDateTime, timeZone: request.timeZone },
    end: { dateTime: request.endDateTime, timeZone: request.timeZone },
    attendees: request.attendeeEmails.map((address) => ({
      emailAddress: { address },
      type: "required",
    })),
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
  };
}

class HttpGraphMeetingClient implements GraphMeetingClient {
  constructor(private readonly config: GraphConfig) {}

  private async request(method: "POST" | "PATCH", path: string, body?: unknown): Promise<Response> {
    let accessToken: string;
    try {
      accessToken = await getAccessToken(this.config);
    } catch (error) {
      throw new TeamsMeetingSyncError(error instanceof Error ? error.message : "Couldn't authenticate with Microsoft Graph.");
    }
    return fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async createMeeting(request: TeamsMeetingRequest): Promise<TeamsMeetingResult> {
    const response = await this.request(
      "POST",
      `/users/${encodeURIComponent(this.config.organiserUpn)}/events`,
      toGraphEvent(request),
    );
    if (!response.ok) {
      const message = await parseGraphError(response);
      logger.error("msgraph.create_meeting_failed", { status: response.status, message });
      throw new TeamsMeetingSyncError(`Microsoft Graph rejected the meeting request: ${message}`);
    }
    const event = (await response.json()) as { id: string; onlineMeeting?: { joinUrl?: string } };
    if (!event.onlineMeeting?.joinUrl) {
      throw new TeamsMeetingSyncError("Microsoft Graph created the event but returned no Teams join link.");
    }
    return { graphEventId: event.id, joinUrl: event.onlineMeeting.joinUrl };
  }

  async updateMeeting(graphEventId: string, request: TeamsMeetingRequest): Promise<TeamsMeetingResult> {
    const response = await this.request(
      "PATCH",
      `/users/${encodeURIComponent(this.config.organiserUpn)}/events/${encodeURIComponent(graphEventId)}`,
      toGraphEvent(request),
    );
    if (!response.ok) {
      const message = await parseGraphError(response);
      logger.error("msgraph.update_meeting_failed", { status: response.status, message });
      throw new TeamsMeetingSyncError(`Microsoft Graph rejected the reschedule: ${message}`);
    }
    const event = (await response.json()) as { id: string; onlineMeeting?: { joinUrl?: string } };
    if (!event.onlineMeeting?.joinUrl) {
      throw new TeamsMeetingSyncError("Microsoft Graph updated the event but returned no Teams join link.");
    }
    return { graphEventId: event.id, joinUrl: event.onlineMeeting.joinUrl };
  }

  async cancelMeeting(graphEventId: string): Promise<void> {
    const response = await this.request(
      "POST",
      `/users/${encodeURIComponent(this.config.organiserUpn)}/events/${encodeURIComponent(graphEventId)}/cancel`,
      { comment: "This interview has been cancelled." },
    );
    // Graph returns 202 Accepted with no body on success; a 404 means the
    // event is already gone (e.g. manually deleted from the organiser's
    // calendar) — treated as an acceptable outcome for a cancel, since
    // the end state (no live meeting) is what was asked for either way.
    if (!response.ok && response.status !== 404) {
      const message = await parseGraphError(response);
      logger.error("msgraph.cancel_meeting_failed", { status: response.status, message });
      throw new TeamsMeetingSyncError(`Microsoft Graph rejected the cancellation: ${message}`);
    }
  }
}

/** Returns null when Graph isn't configured for this environment — the
 *  caller decides how to surface that (a `GraphNotConfiguredError`, or a
 *  quieter "not configured" state), rather than this factory always
 *  throwing for what is, in local/dev environments, an expected state. */
export function getGraphClient(): GraphMeetingClient | null {
  const config = readGraphConfig();
  if (!config) return null;
  return new HttpGraphMeetingClient(config);
}

export function requireGraphClient(): GraphMeetingClient {
  const client = getGraphClient();
  if (!client) throw new GraphNotConfiguredError();
  return client;
}
