import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { loginLimiter } from "@/lib/utils/rate-limiter";
import { z } from "zod";

const changePasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

/**
 * Change the signed-in user's password and clear must_change_password.
 *
 * Users cannot write must_change_password themselves (RLS locks it, see
 * sql/36_user_profiles_lockdown.sql), so the flag is only ever cleared here,
 * after the password update has actually succeeded.
 */
export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get("x-forwarded-for") || "unknown";
    if (!loginLimiter.consume(clientIp)) {
      return NextResponse.json(
        { message: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(loginLimiter.getRetryAfterSeconds(clientIp)) } }
      );
    }

    const serverClient = await createServerClient();
    const { data: { user } } = await serverClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Validation failed" },
        { status: 400 }
      );
    }

    const { error: updateError } = await serverClient.auth.updateUser({ password: parsed.data.password });
    if (updateError) {
      return NextResponse.json({ message: updateError.message }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();
    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (profileError) {
      console.error("Clear must_change_password error:", profileError);
      return NextResponse.json(
        { message: "Password changed, but your account could not be updated. Please contact an administrator." },
        { status: 500 }
      );
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: user.id,
      action: "UPDATE",
      table_name: "user_profiles",
      record_id: user.id,
      old_values: null,
      new_values: { action: "password_changed", must_change_password: false },
      ip_address: clientIp,
    });

    return NextResponse.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ message: "An unexpected error occurred" }, { status: 500 });
  }
}
