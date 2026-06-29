import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sendExpiringRightsAlerts } from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 seconds for Vercel

/**
 * POST /api/notifications/send-alerts
 * Send expiring rights alerts to all eligible users
 *
 * This endpoint should be called by a cron job (e.g., Vercel Cron)
 * Protected by CRON_SECRET environment variable
 *
 * Example Vercel cron config (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/notifications/send-alerts",
 *     "schedule": "0 9 * * *"  // Daily at 9 AM UTC
 *   }]
 * }
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret for security
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    let isAuthorized = false;

    // 1. Check CRON_SECRET (Production/Cron)
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true;
    }
    // 2. Check Vercel Cron Header
    else if (headersList.get("x-vercel-cron")) {
      isAuthorized = true;
    }
    // 3. Fallback: Check Supabase Auth (Local/Manual Testing)
    else {
      // Import here to avoid overhead if not needed
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await sendExpiringRightsAlerts();

    return NextResponse.json({
      success: true,
      sent: result.sent,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error sending expiring rights alerts:", error);
    return NextResponse.json(
      { error: "Failed to send alerts" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/send-alerts
 * Health check / status endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    configured: !!process.env.RESEND_API_KEY,
    endpoint: "/api/notifications/send-alerts",
    method: "POST",
    description: "Send expiring rights alerts to eligible users",
  });
}
