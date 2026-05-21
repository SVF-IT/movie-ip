import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  getUsersForNotification,
  sendDailyDigest,
  type DailyDigestData,
} from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes for Vercel

/**
 * POST /api/notifications/daily-digest
 * Send daily digest to all eligible users
 *
 * This endpoint should be called by a cron job (e.g., Vercel Cron)
 * Protected by CRON_SECRET environment variable
 *
 * Example Vercel cron config (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/notifications/daily-digest",
 *     "schedule": "0 8 * * *"  // Daily at 8 AM UTC
 *   }]
 * }
 */
export async function POST() {
  try {
    // Verify cron secret for security
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // In production, require CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const vercelCronHeader = headersList.get("x-vercel-cron");
      if (!vercelCronHeader) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Check if emails are configured
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    const supabase = await createClient();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Gather statistics
    // 1. Expiring rights counts
    const { data: expiringRights } = await supabase
      .from("expiring_rights")
      .select("days_until_expiry, movie_title, platform_name, right_id")
      .lte("days_until_expiry", 60);

    const criticalExpiring = (expiringRights || []).filter(
      (r) => r.days_until_expiry <= 7
    );
    const urgentExpiring = (expiringRights || []).filter(
      (r) => r.days_until_expiry > 7 && r.days_until_expiry <= 30
    );

    // 2. Activity from last 24 hours (from audit_logs)
    const yesterdayStr = yesterday.toISOString();

    const { count: newMovies } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("table_name", "movies")
      .eq("action", "INSERT")
      .gte("created_at", yesterdayStr);

    // Build digest data
    const stats = {
      criticalExpiring: criticalExpiring.length,
      urgentExpiring: urgentExpiring.length,
      newMovies: newMovies || 0,
    };

    // Get critical rights for the email
    const criticalRightsForEmail = criticalExpiring.slice(0, 5).map((r) => ({
      movieTitle: r.movie_title,
      platformName: r.platform_name,
      daysRemaining: r.days_until_expiry,
      rightId: r.right_id,
    }));

    // Get users who should receive digest
    const users = await getUsersForNotification("daily_digest");

    let sent = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const digestData: DailyDigestData = {
          userName: user.full_name || "User",
          date: today.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          stats,
          criticalRights:
            criticalRightsForEmail.length > 0
              ? criticalRightsForEmail
              : undefined,
        };

        await sendDailyDigest(user.id, user.email, digestData);
        sent++;
      } catch (err) {
        console.error(`Failed to send digest to ${user.email}:`, err);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      errors,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error sending daily digest:", error);
    return NextResponse.json(
      { error: "Failed to send daily digest" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/daily-digest
 * Health check / preview endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    configured: !!process.env.RESEND_API_KEY,
    endpoint: "/api/notifications/daily-digest",
    method: "POST",
    description: "Send daily digest to eligible users",
  });
}
