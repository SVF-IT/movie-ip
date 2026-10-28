import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sendAgreementEndReminders } from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Send acquired-movie agreement-end-date reminders (email + in-app for
 * internal users, email-only for external contacts) for agreements ending
 * within the next 90 days.
 *
 * Triggered automatically by Vercel Cron every 2 weeks (GET, via vercel.json)
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

async function handleAgreementEndReminders() {
  const result = await sendAgreementEndReminders();
  return NextResponse.json({
    success: true,
    sent: result.sent,
    errors: result.errors,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/notifications/agreement-end-reminders
 * Invoked automatically by Vercel Cron (see vercel.json).
 */
export async function GET() {
  try {
    if (!(await isAuthorizedRequest())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await handleAgreementEndReminders();
  } catch (error) {
    console.error("Error sending agreement end reminders:", error);
    return NextResponse.json({ error: "Failed to send agreement end reminders" }, { status: 500 });
  }
}

/**
 * POST /api/notifications/agreement-end-reminders
 * Manual/test trigger — same logic and auth as GET.
 */
export async function POST() {
  try {
    if (!(await isAuthorizedRequest())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await handleAgreementEndReminders();
  } catch (error) {
    console.error("Error sending agreement end reminders:", error);
    return NextResponse.json({ error: "Failed to send agreement end reminders" }, { status: 500 });
  }
}
