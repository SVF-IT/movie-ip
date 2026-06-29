import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendAnniversaryNotifications, createInternalNotification } from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/test-anniversary
 * Two modes:
 *   { "mode": "real" }  — runs the actual anniversary check against live movie data
 *   { "mode": "mock" }  — sends a mock anniversary notification to the caller only (default)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "real" ? "real" : "mock";

    if (mode === "real") {
      const result = await sendAnniversaryNotifications();
      return NextResponse.json({
        success: true,
        mode: "real",
        sent: result.sent,
        errors: result.errors,
        timestamp: new Date().toISOString(),
      });
    }

    // Mock mode — create a fake anniversary notification for the current user only
    const mockAnniversaries = [
      { title: "Piku", milestone: 10, daysUntil: 0 },
      { title: "Chander Pahar", milestone: 15, daysUntil: 3 },
      { title: "Apur Sansar", milestone: 25, daysUntil: 12 },
    ];

    const ordinal = (n: number) => n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";

    const todayItems = mockAnniversaries.filter(a => a.daysUntil === 0);
    const inAppTitle = todayItems.length > 0
      ? `🎉 ${todayItems.map(a => a.title).join(", ")} celebrating today!`
      : `🎬 ${mockAnniversaries.length} upcoming movie anniversaries in the next 30 days`;
    const inAppMessage = mockAnniversaries
      .map(a => `${a.title} — ${a.milestone}${ordinal(a.milestone)} anniversary${a.daysUntil === 0 ? " (today!)" : ` in ${a.daysUntil} days`}`)
      .join("\n");

    await createInternalNotification({
      userId: user.id,
      title: inAppTitle,
      message: inAppMessage,
      type: "anniversary_notification",
      severity: todayItems.length > 0 ? "warning" : "info",
    });

    // Also send mock email via Resend if configured
    let emailSent = false;
    if (process.env.RESEND_API_KEY) {
      const { anniversaryTemplate } = await import("@/lib/email/templates");
      const { sendEmail } = await import("@/lib/email/resend");
      const userName = user.user_metadata?.full_name || user.email.split("@")[0];
      const template = anniversaryTemplate({
        userName,
        anniversaries: [
          { title: "Piku", milestone: 10, releaseYear: 2015, anniversaryDate: "29 June 2025", daysUntil: 0, movieId: "mock-1" },
          { title: "Chander Pahar", milestone: 15, releaseYear: 2013, anniversaryDate: "2 July 2028", daysUntil: 3, movieId: "mock-2" },
          { title: "Apur Sansar", milestone: 25, releaseYear: 2013, anniversaryDate: "11 July 2038", daysUntil: 12, movieId: "mock-3" },
        ],
      });
      await sendEmail({
        to: user.email,
        subject: template.subject,
        html: template.html,
        tags: [{ name: "type", value: "anniversary_notification_test" }],
      });
      emailSent = true;
    }

    return NextResponse.json({
      success: true,
      mode: "mock",
      inAppCreated: true,
      emailSent,
      targetEmail: user.email,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in test-anniversary route:", error);
    return NextResponse.json({ error: "Failed to send test anniversary notification" }, { status: 500 });
  }
}
