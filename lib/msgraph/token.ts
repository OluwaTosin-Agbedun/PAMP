import "server-only";

import { logger } from "@/lib/logging/logger";

/**
 * Shared Microsoft Graph client-credentials (app-only) token acquisition
 * — both `client.ts` (Teams meetings) and `mailClient.ts` (outbound
 * notification email) authenticate against the same tenant/app
 * registration, so the OAuth2 flow and its cached token live here once,
 * not duplicated per feature. Credentials come only from environment
 * configuration (see docs/ENVIRONMENT_CONFIGURATION.md), never
 * hard-coded; the access token is kept in an in-memory module-level
 * variable only — never written to the database, a log line, or an
 * audit entry.
 */

export type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  organiserUpn: string;
  /** Falls back to `organiserUpn` when unset — most tenants send
   *  notification email from the same shared mailbox that organises
   *  Teams meetings, so a separate variable is only needed when that's
   *  not true. */
  mailSenderUpn: string;
};

export function readGraphConfig(): GraphConfig | null {
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const organiserUpn = process.env.MS_GRAPH_ORGANISER_UPN;
  if (!tenantId || !clientId || !clientSecret || !organiserUpn) return null;
  const mailSenderUpn = process.env.MS_GRAPH_MAIL_SENDER_UPN || organiserUpn;
  return { tenantId, clientId, clientSecret, organiserUpn, mailSenderUpn };
}

export function isGraphConfigured(): boolean {
  return readGraphConfig() !== null;
}

// Module-scoped, not request-scoped: safe to reuse across requests in
// the same server process since a client-credentials app token isn't
// tied to any one user's session.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getAccessToken(config: GraphConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.accessToken;
  }

  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    logger.error("msgraph.token_request_failed", { status: response.status });
    // A plain Error, not one of this app's domain AppErrors — a failed
    // token request isn't specific to Teams or Notifications; each
    // caller wraps this into its own domain error (TeamsMeetingSyncError,
    // NotificationSendError) so the message fits where it surfaces.
    throw new Error("Couldn't authenticate with Microsoft Graph — check the configured tenant/client credentials.");
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.accessToken;
}

/** Never includes the raw Graph response body verbatim — it can echo
 *  back request details that don't belong in an error message or an
 *  audit trail; only Graph's own top-level error code/message survive. */
export async function parseGraphError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    return body.error?.message ?? `Microsoft Graph returned ${response.status}.`;
  } catch {
    return `Microsoft Graph returned ${response.status}.`;
  }
}
