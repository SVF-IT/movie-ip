import { createClient } from "@/lib/supabase/client";
import { UserProfile, UserRole } from "@/lib/types/database";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import { logAudit } from "@/lib/api/audit";

// Sign in with email and password
export async function signIn(email: string, password: string) {
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw sanitizeError(error);
  }

  return data;
}

// Sign out
export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw sanitizeError(error);
  }
}

// Get current session
export async function getSession() {
  const supabase = createClient();
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    throw sanitizeError(error);
  }

  return session;
}

// Get user profile from database
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null; // No profile found
      }
      throw sanitizeError(error);
    }

    return data;
  } catch (error) {
    console.error('Error fetching profile:', error);
    throw error;
  }
}

// Update user profile (only own profile)
export async function updateUserProfile(
  userId: string,
  updates: Partial<Pick<UserProfile, "full_name">> & { department?: string | null }
) {
  const supabase = createClient();

  // Verify the user is updating their own profile
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    throw new Error("You can only update your own profile");
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    throw sanitizeError(error);
  }

  return data;
}

// Change password
export async function changePassword(newPassword: string) {
  const supabase = createClient();

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw sanitizeError(error);
  }

  logAudit("UPDATE", "user_profiles", data.user?.id, null, { action: "password_changed" });

  return data;
}

// Admin: Create new user with temporary password
export async function createUser(
  email: string,
  temporaryPassword: string,
  profile: {
    full_name: string;
    employee_id: string;
    role: UserRole;
    department?: string;
  }
) {
  // This needs to be done server-side with service role key
  const response = await fetch("/api/admin/create-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: temporaryPassword,
      ...profile,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create user");
  }

  return response.json();
}

// Admin: Get all users
export async function getAllUsers(): Promise<UserProfile[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw sanitizeError(error);
  }

  return data || [];
}

// Admin: Update user role (server-side enforced)
export async function updateUserRole(userId: string, role: UserRole) {
  const response = await fetch("/api/admin/update-user-role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, role }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update user role");
  }

  const result = await response.json();
  return result.user;
}

// Admin: Toggle user active status (server-side enforced)
export async function toggleUserStatus(userId: string, isActive: boolean) {
  const response = await fetch("/api/admin/update-user-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, isActive }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update user status");
  }

  const result = await response.json();
  return result.user;
}

