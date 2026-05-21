import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createUserSchema } from "@/lib/validations/schemas";
import { adminLimiter } from "@/lib/utils/rate-limiter";

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
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json(
        { message: "Only administrators can create users" },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = createUserSchema.safeParse({
      email: body.email,
      temporaryPassword: body.password,
      profile: {
        full_name: body.full_name,
        employee_id: body.employee_id,
        role: body.role,
        department: body.department,
      },
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, temporaryPassword: password, profile: { full_name, employee_id, role, department } } = parsed.data;

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

    // Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for internal users
    });

    if (authError) {
      console.error("Auth error:", authError);
      return NextResponse.json(
        { message: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { message: "Failed to create user" },
        { status: 500 }
      );
    }

    // Create user profile
    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .insert({
        id: authData.user.id,
        email,
        full_name,
        employee_id,
        role,
        department: department || null,
        is_active: true,
        must_change_password: true, // Force password change on first login
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error("Profile error:", profileError);
      // Try to clean up the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { message: "Failed to create user profile: " + profileError.message },
        { status: 500 }
      );
    }

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      user_id: currentUser.id,
      action: "INSERT",
      table_name: "user_profiles",
      record_id: authData.user.id,
      old_values: null,
      new_values: { email, full_name, employee_id, role, department: department || null },
      ip_address: clientIp,
    });

    return NextResponse.json({
      message: "User created successfully",
      user: {
        id: authData.user.id,
        email,
        full_name,
        employee_id,
        role,
        department,
      },
    });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
