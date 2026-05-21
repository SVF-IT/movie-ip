import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getEffectivePreferences,
  updateUserNotificationPreference,
  type NotificationType,
} from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/preferences
 * Get user's notification preferences combined with global settings
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Check auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getEffectivePreferences(user.id);
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch notification preferences" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/notifications/preferences
 * Update user's notification preference
 * Users can only enable/disable notifications that are globally enabled
 * Users cannot disable ALL notifications - at least one must remain enabled
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();

    // Check auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notification_type, is_enabled } = body as {
      notification_type: NotificationType;
      is_enabled: boolean;
    };

    if (!notification_type || typeof is_enabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // If user is trying to disable, check that they won't end up with all notifications off
    if (!is_enabled) {
      const currentPrefs = await getEffectivePreferences(user.id);

      // Count how many will be enabled after this change
      const enabledAfterChange = currentPrefs.filter((p) => {
        if (p.notification_type === notification_type) {
          return false; // This one will be disabled
        }
        return p.globally_enabled && p.user_enabled;
      });

      // Ensure at least one notification type remains enabled
      if (enabledAfterChange.length === 0) {
        return NextResponse.json(
          { error: "You must have at least one notification type enabled" },
          { status: 400 }
        );
      }
    }

    const success = await updateUserNotificationPreference(
      user.id,
      notification_type,
      is_enabled
    );

    if (!success) {
      return NextResponse.json(
        { error: "Failed to update preference" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating notification preference:", error);
    return NextResponse.json(
      { error: "Failed to update notification preference" },
      { status: 500 }
    );
  }
}
