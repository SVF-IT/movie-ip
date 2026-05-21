import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyRightsExpiring } from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/test-email
 * Send a sample expiring rights email directly to the caller
 */
export async function POST() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user || !user.email) {
            return NextResponse.json({ error: "Unauthorized or no email" }, { status: 401 });
        }

        const mockData = {
            userName: user.user_metadata?.full_name || user.email.split('@')[0],
            recipientEmail: user.email,
            userId: user.id,
            urgencyLevel: "daily_final_week" as any,
            items: [
                {
                    title: "Test Movie (Acquired)",
                    subTitle: "Movie Agreement",
                    type: "movie_agreement" as const,
                    endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                    daysRemaining: 3,
                    id: "test-id-1",
                },
                {
                    title: "Another Test Title",
                    subTitle: "Satellite Rights - Platform X",
                    type: "asset" as const,
                    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                    daysRemaining: 5,
                    id: "test-id-2",
                }
            ],
        };

        const result = await notifyRightsExpiring(mockData);

        return NextResponse.json({
            success: true,
            result,
            targetEmail: user.email,
        });
    } catch (error) {
        console.error("Error in test-email route:", error);
        return NextResponse.json(
            { error: "Failed to send test email" },
            { status: 500 }
        );
    }
}
