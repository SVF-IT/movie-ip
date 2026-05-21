import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getGlobalNotificationSettings,
  updateGlobalNotificationSetting,
  type NotificationType,
} from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/settings
 * Get global notification settings (admin only)
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Check auth and role
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use get_user_role helper to check if admin
    const { data: role } = await supabase.rpc("get_user_role", { user_id: user.id });

    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    const settings = await getGlobalNotificationSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error fetching global notification settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch global notification settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/notifications/settings
 * Update global notification setting (admin only)
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();

    // Check auth and role
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: role } = await supabase.rpc("get_user_role", { user_id: user.id });

    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
    }

    const body = await request.json();
    const { notification_type, is_enabled, role_filters } = body as {
      notification_type: NotificationType;
      is_enabled?: boolean;
      role_filters?: string[] | null;
    };

    if (!notification_type) {
      return NextResponse.json(
        { error: "Notification type is required" },
        { status: 400 }
      );
    }

    const success = await updateGlobalNotificationSetting(notification_type, {
      is_enabled,
      role_filters
    });

    if (!success) {
      return NextResponse.json(
        { error: "Failed to update global setting" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating global notification setting:", error);
    return NextResponse.json(
      { error: "Failed to update global notification setting" },
      { status: 500 }
    );
  }
}
