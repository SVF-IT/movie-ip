import { createClient } from "@/lib/supabase/client";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import type { AuditLogEntry } from "@/lib/types/database";

const supabase = createClient();

export async function getAuditLogs(options?: {
  tableName?: string;
  action?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: AuditLogEntry[]; count: number }> {
  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" });

  if (options?.tableName) {
    query = query.eq("table_name", options.tableName);
  }
  if (options?.action) {
    query = query.eq("action", options.action);
  }
  if (options?.userId) {
    query = query.eq("user_id", options.userId);
  }
  if (options?.dateFrom) {
    query = query.gte("created_at", options.dateFrom);
  }
  if (options?.dateTo) {
    query = query.lte("created_at", options.dateTo);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit || 50) - 1
    );
  }

  query = query.order("created_at", { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    throw sanitizeError(error);
  }

  const rows = data || [];

  // Batch-fetch user profiles for all distinct user_ids in the result page
  const userIds = [...new Set(rows.map((r: Record<string, unknown>) => r.user_id).filter(Boolean))] as string[];
  let profileMap: Record<string, { email?: string; full_name?: string }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, email, full_name")
      .in("id", userIds);
    if (profiles) {
      profileMap = Object.fromEntries(profiles.map((p: { id: string; email?: string; full_name?: string }) => [p.id, p]));
    }
  }

  const mapped: AuditLogEntry[] = rows.map((row: Record<string, unknown>) => {
    const profile = profileMap[row.user_id as string] || null;
    return {
      id: row.id as string,
      user_id: row.user_id as string | undefined,
      action: row.action as string,
      table_name: row.table_name as string,
      record_id: row.record_id as string | undefined,
      old_values: row.old_values as Record<string, unknown> | undefined,
      new_values: row.new_values as Record<string, unknown> | undefined,
      ip_address: row.ip_address as string | undefined,
      created_at: row.created_at as string | undefined,
      user_email: profile?.email || undefined,
      user_full_name: profile?.full_name || undefined,
    };
  });

  return { data: mapped, count: count || 0 };
}

export async function getAuditLogStats(): Promise<{
  totalEvents: number;
  eventsToday: number;
  eventsThisWeek: number;
}> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [totalResult, todayResult, weekResult] = await Promise.all([
      supabase.from("audit_logs").select("*", { count: "exact", head: true }),
      supabase
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString()),
      supabase
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekAgo.toISOString()),
    ]);

    return {
      totalEvents: totalResult.count || 0,
      eventsToday: todayResult.count || 0,
      eventsThisWeek: weekResult.count || 0,
    };
  } catch (error) {
    throw sanitizeError(error);
  }
}

// Fire-and-forget activity logging
export function logActivity(
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: Record<string, unknown>
): void {
  supabase
    .from("user_activity")
    .insert({
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
    })
    .then(() => {})
    .catch((err: unknown) => console.error("Activity log error:", err));
}

// Fire-and-forget audit log entry (writes to audit_logs table)
export function logAudit(
  action: "INSERT" | "UPDATE" | "DELETE",
  tableName: string,
  recordId?: string,
  oldValues?: Record<string, unknown> | null,
  newValues?: Record<string, unknown> | null
): void {
  supabase.auth
    .getUser()
    .then(({ data: { user } }: { data: { user: { id: string } | null } }) => {
      supabase
        .from("audit_logs")
        .insert({
          user_id: user?.id || null,
          action,
          table_name: tableName,
          record_id: recordId || null,
          old_values: oldValues || null,
          new_values: newValues || null,
        })
        .then(() => {})
        .catch((err: unknown) => console.error("Audit log error:", err));
    })
    .catch((err: unknown) => console.error("Audit log auth error:", err));
}
