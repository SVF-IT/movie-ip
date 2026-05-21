import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendExpiringRightsAlerts } from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/test-alerts
 * Manually trigger expiring alerts for testing
 * 
 * Body: {
 *   mockDate?: string (ISO date string)
 * }
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only allow admins to use this or maybe even lock it down more
        // For now, let's just make sure they are authenticated

        const body = await request.json().catch(() => ({}));
        const mockDate = body.mockDate ? new Date(body.mockDate) : undefined;

        const result = await sendExpiringRightsAlerts(mockDate, true); // Use range mode for manual testing

        return NextResponse.json({
            success: true,
            sent: result.sent,
            errors: result.errors,
            mockDate: mockDate ? mockDate.toISOString() : "current",
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Error in test-alerts route:", error);
        return NextResponse.json(
            { error: "Failed to trigger alerts" },
            { status: 500 }
        );
    }
}
