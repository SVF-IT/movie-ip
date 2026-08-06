import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getExternalRecipients,
  createExternalRecipient,
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
  if (role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 }) };
  }

  return { ok: true as const };
}

/**
 * GET /api/notifications/external-recipients
 * List all external (non-app-user) notification contacts (admin only)
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const recipients = await getExternalRecipients();
    return NextResponse.json({ recipients });
  } catch (error) {
    console.error("Error fetching external recipients:", error);
    return NextResponse.json({ error: "Failed to fetch external recipients" }, { status: 500 });
  }
}

/**
 * POST /api/notifications/external-recipients
 * Create a new external notification contact (admin only)
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, email, tag, notification_types } = body as {
      name?: string;
      email?: string;
      tag?: string | null;
      notification_types?: string[];
    };

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const types = (notification_types || []).filter((t): t is NotificationType =>
      KNOWN_NOTIFICATION_TYPES.includes(t as NotificationType)
    );

    const recipient = await createExternalRecipient({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      tag: tag?.trim() || null,
      notification_types: types,
    });

    if (!recipient) {
      return NextResponse.json({ error: "Failed to create contact (email may already exist)" }, { status: 500 });
    }

    return NextResponse.json({ recipient }, { status: 201 });
  } catch (error) {
    console.error("Error creating external recipient:", error);
    return NextResponse.json({ error: "Failed to create external recipient" }, { status: 500 });
  }
}
