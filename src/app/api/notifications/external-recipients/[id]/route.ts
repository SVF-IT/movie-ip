import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/types/database";
import {
  updateExternalRecipient,
  deleteExternalRecipient,
  type NotificationType,
} from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";

const KNOWN_NOTIFICATION_TYPES: NotificationType[] = [
  "rights_expiring_digest",
  "agreement_end_reminder",
  "movie_created",
  "recensor_reminder",
  "pending_approvals_reminder",
  "user_created",
  "password_reset",
  "anniversary_notification",
];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: role } = await supabase.rpc("get_user_role", { user_id: user.id });
  if (!isAdminRole(role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 }) };
  }

  return { ok: true as const };
}

/**
 * PATCH /api/notifications/external-recipients/[id]
 * Update an external notification contact (admin only)
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, email, tag, notification_types, is_active } = body as {
      name?: string;
      email?: string;
      tag?: string | null;
      notification_types?: string[];
      is_active?: boolean;
    };

    const updates: Parameters<typeof updateExternalRecipient>[1] = {};

    if (name !== undefined) {
      if (!name.trim()) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      updates.name = name.trim();
    }
    if (email !== undefined) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email.trim())) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
      updates.email = email.trim().toLowerCase();
    }
    if (tag !== undefined) updates.tag = tag?.trim() || null;
    if (notification_types !== undefined) {
      updates.notification_types = notification_types.filter((t): t is NotificationType =>
        KNOWN_NOTIFICATION_TYPES.includes(t as NotificationType)
      );
    }
    if (is_active !== undefined) updates.is_active = is_active;

    const success = await updateExternalRecipient(id, updates);
    if (!success) {
      return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating external recipient:", error);
    return NextResponse.json({ error: "Failed to update external recipient" }, { status: 500 });
  }
}

/**
 * DELETE /api/notifications/external-recipients/[id]
 * Remove an external notification contact (admin only)
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const success = await deleteExternalRecipient(id);
    if (!success) {
      return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting external recipient:", error);
    return NextResponse.json({ error: "Failed to delete external recipient" }, { status: 500 });
  }
}
