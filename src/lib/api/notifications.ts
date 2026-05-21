import { createClient } from "@/lib/supabase/client";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  severity: "info" | "warning" | "critical";
  is_read: boolean;
  resource_type?: string;
  resource_id?: string;
  created_at: string;
}

export async function getUnreadNotifications(): Promise<Notification[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching notifications:", error);
    return [];
  }
  return (data as Notification[]) || [];
}

export async function getNotificationCount(): Promise<number> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    console.error("Error fetching notification count:", error);
    return 0;
  }
  return count || 0;
}

export async function getAllNotifications(
  filter?: "all" | "unread"
): Promise<Notification[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter === "unread") {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching notifications:", error);
    return [];
  }
  return (data as Notification[]) || [];
}

export async function markAsRead(id: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function markAllAsRead(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);
}

export async function createNotification(params: {
  userId?: string;
  title: string;
  message: string;
  type: string;
  severity?: "info" | "warning" | "critical";
  resourceType?: string;
  resourceId?: string;
}): Promise<void> {
  const supabase = createClient();

  // Use provided userId or fall back to current authenticated user
  let targetUserId = params.userId;
  if (!targetUserId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    targetUserId = user.id;
  }

  await supabase.from("notifications").insert({
    user_id: targetUserId,
    title: params.title,
    message: params.message,
    type: params.type,
    severity: params.severity || "info",
    resource_type: params.resourceType,
    resource_id: params.resourceId,
  });
}
