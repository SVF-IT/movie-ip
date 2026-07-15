import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sendRecensorReminders } from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Send monthly recensor reminders for A-certified movies with recensor_flag = true.
 *
 * Triggered automatically by Vercel Cron (GET, via vercel.json) or manually
 * (POST, e.g. for testing) — both paths run the same authorized logic.
 * Protected by CRON_SECRET / Vercel's x-vercel-cron header / an authenticated session.
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

async function handleRecensorReminders() {
  const result = await sendRecensorReminders();
  return NextResponse.json({
    success: true,
    sent: result.sent,
    errors: result.errors,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/notifications/recensor-reminders
 * Invoked automatically by Vercel Cron (see vercel.json).
 */
export async function GET() {
  try {
    if (!(await isAuthorizedRequest())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await handleRecensorReminders();
  } catch (error) {
    console.error("Error sending recensor reminders:", error);
    return NextResponse.json({ error: "Failed to send recensor reminders" }, { status: 500 });
  }
}

/**
 * POST /api/notifications/recensor-reminders
 * Manual/test trigger — same logic and auth as GET.
 */
export async function POST() {
  try {
    if (!(await isAuthorizedRequest())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await handleRecensorReminders();
  } catch (error) {
    console.error("Error sending recensor reminders:", error);
    return NextResponse.json({ error: "Failed to send recensor reminders" }, { status: 500 });
  }
}
