import { createClient } from "@/lib/supabase/client";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import type { AuditLogEntry } from "@/lib/types/database";

const supabase = createClient();

/**
 * Audit entries matching the filters, newest first. Runs through the
 * audit_log_search function so the free-text search can match the user's name
 * and the linked movie's title, neither of which is stored on the log row.
 */
export async function getAuditLogs(options?: {
  tableName?: string[];
  action?: string[];
  /** Matches user name/email, movie title, or a name in the logged values. */
  search?: string;
  /** false hides "System" entries — changes with no user behind them. */
  includeSystem?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<{ data: AuditLogEntry[]; count: number }> {
  if ((options?.tableName && options.tableName.length === 0) || (options?.action && options.action.length === 0)) {
    return { data: [], count: 0 };
  }

  const { data: result, error } = await supabase.rpc("audit_log_search", {
    p_query: options?.search?.trim() || null,
    p_tables: options?.tableName?.length ? options.tableName : null,
    p_actions: options?.action?.length ? options.action : null,
    p_date_from: options?.dateFrom || null,
    p_date_to: options?.dateTo || null,
    p_limit: options?.limit ?? 10000,
    p_include_system: options?.includeSystem ?? true,
  });

  if (error) {
    throw sanitizeError(error);
  }

  const { rows: data, count } = (result ?? { rows: [], count: 0 }) as {
    rows: Record<string, unknown>[];
    count: number;
  };
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
