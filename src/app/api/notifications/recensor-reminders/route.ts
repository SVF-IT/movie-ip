import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sendRecensorReminders } from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/notifications/recensor-reminders
 * Send monthly recensor reminders for A-certified movies with recensor_flag = true.
 * Called by Vercel Cron on the 1st of each month.
 */
export async function POST(request: Request) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    let isAuthorized = false;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true;
    } else if (headersList.get("x-vercel-cron")) {
      isAuthorized = true;
    } else {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) isAuthorized = true;
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await sendRecensorReminders();

    return NextResponse.json({
      success: true,
      sent: result.sent,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error sending recensor reminders:", error);
    return NextResponse.json({ error: "Failed to send recensor reminders" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/notifications/recensor-reminders",
    method: "POST",
    description: "Monthly recensor reminders for A-certified movies",
  });
}
