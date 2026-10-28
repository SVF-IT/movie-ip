import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 30;

/**
 * Purge in-app notifications older than RETENTION_DAYS (read or unread) via
 * the cleanup_old_notifications() DB function (see sql/29_notification_cadence_changes.sql).
 *
 * Triggered automatically by Vercel Cron (GET, via vercel.json) or manually
 * (POST, e.g. for testing) — both paths run the same authorized logic.
 * Protected by CRON_SECRET only (sent by Vercel Cron as a Bearer token).
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

async function handleCleanup() {
  // Service-role client: this runs from Vercel Cron with no user session, and
  // the notifications RLS delete policy only lets a user remove their own rows.
  const supabase = createAdminClient();
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
