import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sendExpiringRightsAlerts } from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 seconds for Vercel

/**
 * Send expiring rights alerts to all eligible users.
 *
 * Triggered automatically by Vercel Cron (GET, via vercel.json) or manually
 * (POST, e.g. for testing) — both paths run the same authorized logic.
 * Protected by CRON_SECRET / Vercel's x-vercel-cron header / an authenticated session.
 */
async function isAuthorizedRequest(): Promise<boolean> {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // 1. Check CRON_SECRET (manual/external cron trigger)
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  // 2. Vercel Cron auto-injects this header — no secret needed for native Vercel Cron
  if (headersList.get("x-vercel-cron")) return true;

  // 3. Fallback: authenticated session (local/manual testing from the app)
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

async function handleSendAlerts() {
  const result = await sendExpiringRightsAlerts();
  return NextResponse.json({
    success: true,
    sent: result.sent,
    errors: result.errors,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/notifications/send-alerts
 * Invoked automatically by Vercel Cron (see vercel.json).
 */
export async function GET() {
  try {
    if (!(await isAuthorizedRequest())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await handleSendAlerts();
  } catch (error) {
    console.error("Error sending expiring rights alerts:", error);
    return NextResponse.json({ error: "Failed to send alerts" }, { status: 500 });
  }
}

/**
 * POST /api/notifications/send-alerts
 * Manual/test trigger — same logic and auth as GET.
 */
export async function POST() {
  try {
    if (!(await isAuthorizedRequest())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await handleSendAlerts();
  } catch (error) {
    console.error("Error sending expiring rights alerts:", error);
    return NextResponse.json({ error: "Failed to send alerts" }, { status: 500 });
  }
}
