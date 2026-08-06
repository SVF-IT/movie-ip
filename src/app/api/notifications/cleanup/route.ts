import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 30;

/**
 * Purge in-app notifications older than RETENTION_DAYS (read or unread) via
 * the cleanup_old_notifications() DB function (see sql/29_notification_cadence_changes.sql).
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

async function handleCleanup() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cleanup_old_notifications", {
    retention_days: RETENTION_DAYS,
  });

  if (error) {
    console.error("Error cleaning up notifications:", error);
    return NextResponse.json({ error: "Failed to clean up notifications" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deleted: data,
    retentionDays: RETENTION_DAYS,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/notifications/cleanup
 * Invoked automatically by Vercel Cron (see vercel.json).
 */
export async function GET() {
  if (!(await isAuthorizedRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleCleanup();
}

/**
 * POST /api/notifications/cleanup
 * Manual/test trigger — same logic and auth as GET.
 */
export async function POST() {
  if (!(await isAuthorizedRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleCleanup();
}
