import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { adminLimiter } from "@/lib/utils/rate-limiter";
import { z } from "zod";

const updateRoleSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  role: z.enum(["admin", "editor", "legal", "viewer"]),
});

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

    // Verify the requesting user is an admin
    const serverClient = await createServerClient();
    const { data: { user: currentUser } } = await serverClient.auth.getUser();

    if (!currentUser) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: adminProfile } = await serverClient
      .from("user_profiles")
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json(
        { message: "Only administrators can change user roles" },
        { status: 403 }
      );
    }

    // Validate input
    const body = await request.json();
    const parsed = updateRoleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { userId, role } = parsed.data;

    // Get old role for audit log
    const { data: targetProfile } = await serverClient
      .from("user_profiles")
      .select("role, email, full_name")
      .eq("id", userId)
      .single();

    if (!targetProfile) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    // Update role
    const { data, error } = await serverClient
      .from("user_profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      console.error("Role update error:", error);
      return NextResponse.json(
        { message: "Failed to update user role" },
        { status: 500 }
      );
    }

    // Audit log
    await serverClient.from("audit_logs").insert({
      user_id: currentUser.id,
      action: "UPDATE",
      table_name: "user_profiles",
      record_id: userId,
      old_values: { role: targetProfile.role },
      new_values: { role },
      ip_address: clientIp,
    });

    return NextResponse.json({
      message: "User role updated successfully",
      user: data,
    });
  } catch (error) {
    console.error("Update role error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
