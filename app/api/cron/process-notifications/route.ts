import { NextResponse } from "next/server";

import { logger } from "@/lib/logging/logger";
import { checkMissedClarificationDeadlines } from "@/modules/eligibility/screeningService";
import { sendDueReminders } from "@/modules/interviews/services/schedulingService";
import { processDueNotifications } from "@/modules/notifications/services/notificationService";

/**
 * Notification Infrastructure — the one entry point for scheduled sends
 * (interview reminders, anything else enqueued with a future
 * `scheduledFor`). This codebase runs no persistent background process
 * (no queue worker, no cron daemon) — nothing here fires on its own.
 * An external scheduler (Vercel Cron, a GitHub Action, any periodic
 * pinger) must call this endpoint on an interval; see
 * docs/NOTIFICATIONS.md for the recommended interval and setup.
 *
 * Three steps, in order: `checkMissedClarificationDeadlines` auto-marks
 * any eligibility screening past its clarification-response deadline
 * Ineligible (enqueueing its own applicant notification);
 * `sendDueReminders` scans confirmed interviews and enqueues any
 * newly-due INTERVIEW_REMINDER notification (Interview Configuration
 * §4); `processDueNotifications` then drains the whole outbox, including
 * whatever the first two steps just enqueued.
 *
 * Authenticated by a shared secret bearer token
 * (`NOTIFICATIONS_CRON_SECRET`), not a user session — this is a
 * machine-to-machine endpoint, never linked from the UI.
 */
export async function POST(request: Request) {
  const expected = process.env.NOTIFICATIONS_CRON_SECRET;
  if (!expected) {
    logger.error("notifications.cron_secret_not_configured");
    return NextResponse.json({ error: "This endpoint is not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clarificationDeadlines = await checkMissedClarificationDeadlines();
  const reminders = await sendDueReminders();
  const result = await processDueNotifications();
  return NextResponse.json({ ...result, ...reminders, clarificationDeadlines });
}
