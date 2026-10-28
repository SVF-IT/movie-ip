import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sendAnniversaryNotifications } from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Send movie anniversary/jubilee milestone notifications (email + in-app for
 * internal users, email-only for external contacts) for anniversaries falling
 * within the next 10 days.
 *
 * Triggered automatically by Vercel Cron every 10 days (GET, via vercel.json)
 * or manually (POST, e.g. for testing) — both paths run the same authorized
 * logic. Protected by CRON_SECRET only (sent by Vercel Cron as a Bearer token).
 */
async function isAuthorizedRequest(): Promise<boolean> {
  // Only the shared secret is trusted. Vercel Cron sends it as a Bearer token
  // when CRON_SECRET is set on the project; the x-vercel-cron header can be
  // forged by any caller, so it is not accepted.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = (await headers()).get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

async function handleAnniversaryReminders() {
  const result = await sendAnniversaryNotifications();
  return NextResponse.json({
    success: true,
    sent: result.sent,
    errors: result.errors,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/notifications/anniversary-reminders
 * Invoked automatically by Vercel Cron (see vercel.json).
 */
export async function GET() {
  try {
    if (!(await isAuthorizedRequest())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await handleAnniversaryReminders();
  } catch (error) {
    console.error("Error sending anniversary reminders:", error);
    return NextResponse.json({ error: "Failed to send anniversary reminders" }, { status: 500 });
  }
}

/**
 * POST /api/notifications/anniversary-reminders
 * Manual/test trigger — same logic and auth as GET.
 */
export async function POST() {
  try {
    if (!(await isAuthorizedRequest())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await handleAnniversaryReminders();
  } catch (error) {
    console.error("Error sending anniversary reminders:", error);
    return NextResponse.json({ error: "Failed to send anniversary reminders" }, { status: 500 });
  }
}
