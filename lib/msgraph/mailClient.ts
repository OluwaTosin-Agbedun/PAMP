import "server-only";

import { logger } from "@/lib/logging/logger";
import { GraphNotConfiguredError, NotificationSendError } from "@/lib/errors";

import { getAccessToken, isGraphConfigured, parseGraphError, readGraphConfig, type GraphConfig } from "./token";

export { isGraphConfigured };

/**
 * Notification Infrastructure — the one place that sends real email via
 * Microsoft Graph. Shared tenant authentication lives in `./token.ts`
 * (also used by `./client.ts` for Teams meetings); this file owns only
 * the mail-shaped request. `MailSendClient` is the seam
 * `notificationDeliveryService.ts` depends on — tests inject a mock, so
 * the automated suite never sends a real email.
 *
 * Graph's `sendMail` endpoint returns `202 Accepted` with an empty body
 * on success — no message identifier is available from this call
 * (unlike creating-then-sending a draft, which this integration
 * deliberately doesn't use, to keep one request per send). Callers
 * should expect `providerMessageId` to usually be `null`.
 */

export type MailSendRequest = {
  toEmail: string;
  subject: string;
  /** Plain text — deliberately not HTML. Every notification template is
   *  a Configuration Centre-editable plain-text string (§5.4: "Do not
   *  allow administrators to place unsafe executable content in
   *  templates") — HTML would reopen exactly the injection risk that
   *  rule exists to close. */
  body: string;
  senderName: string;
  replyToEmail?: string;
};

export type MailSendResult = {
  providerMessageId: string | null;
};

export interface MailSendClient {
  sendMail(request: MailSendRequest): Promise<MailSendResult>;
}

function toGraphMessage(request: MailSendRequest) {
  return {
    message: {
      subject: request.subject,
      body: { contentType: "Text", content: request.body },
      toRecipients: [{ emailAddress: { address: request.toEmail } }],
      ...(request.replyToEmail ? { replyTo: [{ emailAddress: { address: request.replyToEmail } }] } : {}),
    },
    saveToSentItems: true,
  };
}

class HttpMailSendClient implements MailSendClient {
  constructor(private readonly config: GraphConfig) {}

  async sendMail(request: MailSendRequest): Promise<MailSendResult> {
    let accessToken: string;
    try {
      accessToken = await getAccessToken(this.config);
    } catch (error) {
      throw new NotificationSendError(error instanceof Error ? error.message : "Couldn't authenticate with Microsoft Graph.");
    }

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.mailSenderUpn)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toGraphMessage(request)),
      },
    );

    if (!response.ok) {
      const message = await parseGraphError(response);
      logger.error("msgraph.send_mail_failed", { status: response.status, message });
      throw new NotificationSendError(`Microsoft Graph rejected the message: ${message}`);
    }

    // 202 Accepted, empty body — no provider message identifier available.
    return { providerMessageId: null };
  }
}

export function getMailClient(): MailSendClient | null {
  const config = readGraphConfig();
  if (!config) return null;
  return new HttpMailSendClient(config);
}

export function requireMailClient(): MailSendClient {
  const client = getMailClient();
  if (!client) throw new GraphNotConfiguredError("Microsoft Graph email delivery isn't configured in this environment.");
  return client;
}
