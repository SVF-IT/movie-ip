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
 * logic. Protected by CRON_SECRET / Vercel's x-vercel-cron header / an
 * authenticated session.
 */
async function isAuthorizedRequest(): Promise<boolean> {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (headersList.get("x-vercel-cron")) return true;

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
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
