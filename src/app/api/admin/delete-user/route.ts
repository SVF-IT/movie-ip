import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { adminLimiter } from "@/lib/utils/rate-limiter";
import { z } from "zod";

const deleteUserSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get("x-forwarded-for") || "unknown";
    if (!adminLimiter.consume(clientIp)) {
      return NextResponse.json(
        { message: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(adminLimiter.getRetryAfterSeconds(clientIp)) } }
      );
    }

    const serverClient = await createServerClient();
    const { data: { user: currentUser } } = await serverClient.auth.getUser();

    if (!currentUser) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { data: adminProfile } = await serverClient
      .from("user_profiles")
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json({ message: "Only administrators can delete users" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = deleteUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { userId } = parsed.data;

    if (userId === currentUser.id) {
      return NextResponse.json({ message: "You cannot delete your own account" }, { status: 400 });
    }

    const { data: targetProfile } = await serverClient
      .from("user_profiles")
      .select("full_name, email")
      .eq("id", userId)
      .single();

    if (!targetProfile) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Null out the user's id in all tables that reference it, keeping name fields intact
    await Promise.all([
      // movies: created_by
      serverClient.from("movies").update({ created_by: null }).eq("created_by", userId),
      // movie_approvals: reviewer_id, approved_by (keep reviewer_name)
      serverClient.from("movie_approvals").update({ reviewer_id: null }).eq("reviewer_id", userId),
      // pending_changes: submitted_by_id (keep changed_by_name)
      serverClient.from("pending_changes").update({ submitted_by_id: null }).eq("submitted_by_id", userId),
      // audit_logs: user_id (soft null — just null the id)
      serverClient.from("audit_logs").update({ user_id: null }).eq("user_id", userId),
    ]);

    // Delete from user_profiles (auth user deletion requires service role — handled via profile delete + deactivate)
    const { error: profileError } = await serverClient
      .from("user_profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.error("Delete user profile error:", profileError);
      return NextResponse.json({ message: "Failed to delete user" }, { status: 500 });
    }

    // Audit log the deletion using current admin
    await serverClient.from("audit_logs").insert({
      user_id: currentUser.id,
      action: "DELETE",
      table_name: "user_profiles",
      record_id: userId,
      old_values: { full_name: targetProfile.full_name, email: targetProfile.email },
      new_values: null,
      ip_address: clientIp,
    });

    return NextResponse.json({ message: `User "${targetProfile.full_name || targetProfile.email}" deleted successfully` });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ message: "An unexpected error occurred" }, { status: 500 });
  }
}
