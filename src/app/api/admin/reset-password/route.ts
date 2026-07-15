import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/validations/schemas";
import { adminLimiter } from "@/lib/utils/rate-limiter";
import { notifyPasswordReset } from "@/lib/email/notification-service";

export async function POST(request: Request) {
  try {
    // Rate limiting
    const clientIp = request.headers.get("x-forwarded-for") || "unknown";
    if (!adminLimiter.consume(clientIp)) {
      return NextResponse.json(
        { message: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(adminLimiter.getRetryAfterSeconds(clientIp)) },
        }
      );
    }

    // First, verify the requesting user is an admin
    const serverClient = await createServerClient();
    const { data: { user: currentUser } } = await serverClient.auth.getUser();

    if (!currentUser) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if current user is admin
    const { data: adminProfile } = await serverClient
      .from("user_profiles")
      .select("role, full_name")
      .eq("id", currentUser.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json(
        { message: "Only administrators can reset passwords" },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse({ email: body.email });

    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email } = parsed.data;
    const { newPassword } = body;

    // Validate new password strength if provided
    if (newPassword) {
      if (typeof newPassword !== "string" || newPassword.length < 8) {
        return NextResponse.json(
          { message: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Find the user by email
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      console.error("List users error:", listError);
      return NextResponse.json(
        { message: "Failed to find user" },
        { status: 500 }
      );
    }

    const targetUser = users.users.find(u => u.email === email);

    if (!targetUser) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    // If newPassword is provided, directly update the password
    if (newPassword) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUser.id,
        { password: newPassword }
      );

      if (updateError) {
        console.error("Password update error:", updateError);
        return NextResponse.json(
          { message: updateError.message },
          { status: 400 }
        );
      }

      // Mark that user must change password
      const { data: targetProfile } = await supabaseAdmin
        .from("user_profiles")
        .update({
          must_change_password: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetUser.id)
        .select("full_name")
        .single();

      // Audit log
      await supabaseAdmin.from("audit_logs").insert({
        user_id: currentUser.id,
        action: "UPDATE",
        table_name: "user_profiles",
        record_id: targetUser.id,
        old_values: { action: "password_reset_requested" },
        new_values: { must_change_password: true },
        ip_address: clientIp,
      });

      // Best-effort notification — don't fail the reset if this errors
      try {
        await notifyPasswordReset({
          email,
          userName: targetProfile?.full_name || email,
          newPassword,
          resetBy: adminProfile.full_name || "An administrator",
        });
      } catch (notifyError) {
        console.error("Failed to send password-reset notification:", notifyError);
      }

      return NextResponse.json({
        message: "Password has been reset. User will need to change it on next login.",
      });
    }

    // Otherwise, generate a password reset link (for email-based reset)
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (error) {
      console.error("Generate link error:", error);
      return NextResponse.json(
        { message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Password reset link generated",
      link: data.properties?.action_link,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
