"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Check,
  AlertTriangle,
  Info,
  RefreshCw,
  ArrowRightLeft,
  Film,
  Building,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  getAllNotifications,
  markAsRead,
  markAllAsRead,
  type Notification,
} from "@/lib/api/notifications";

const typeIcons: Record<string, typeof Bell> = {
  expiry_warning: AlertTriangle,
  rights_renewed: RefreshCw,
  rights_transferred: ArrowRightLeft,
  movie_added: Film,
  platform_added: Building,
  system: Info,
};

const severityDot: Record<string, string> = {
  info: "bg-blue-400",
  warning: "bg-amber-400",
  critical: "bg-red-500",
};

const severityBadge: Record<string, string> = {
  info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  warning: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
};

const unreadBorder: Record<string, string> = {
  info: "border-l-blue-500",
  warning: "border-l-amber-500",
  critical: "border-l-red-500",
};

type FilterType = "all" | "unread";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      setNotifications(await getAllNotifications(filter === "unread" ? "unread" : "all"));
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    await markAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4">
      {/* ── Compact toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 p-2 rounded-[9px] bg-indigo-500/10 border border-indigo-500/20">
          <Bell className="h-4 w-4 text-indigo-400" />
        </div>
        <p className="text-sm text-(--text-dim)">
          {unreadCount > 0
            ? <><span className="font-semibold text-(--text)">{unreadCount}</span> unread notification{unreadCount !== 1 ? "s" : ""}</>
            : "All caught up"}
        </p>

        {/* Filter pills */}
        {(["all", "unread"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filter === f
              ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
              : "bg-(--bg-raise) text-(--text-faint) border-(--svf-border) hover:border-(--svf-border-strong) hover:text-(--text-dim)"
              }`}
          >
            {f === "unread" ? `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}` : "All"}
          </button>
        ))}

        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead}
            className="ml-auto text-(--text-faint) hover:text-(--text) hover:bg-(--hover) gap-1.5 h-8">
            <Check className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--svf-accent)" }} />
        </div>
      ) : notifications.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="p-4 rounded-full bg-(--bg-raise) border border-(--svf-border) w-fit mx-auto mb-4">
            <Bell className="h-8 w-8 text-(--text-faint)" />
          </div>
          <p className="font-semibold text-(--text)">No notifications</p>
          <p className="text-sm text-(--text-faint) mt-1">
            {filter === "unread" ? "You have no unread notifications" : "You have no notifications yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = typeIcons[n.type] || Info;
            const sev = n.severity || "info";
            return (
              <div
                key={n.id}
                className={`relative rounded-[12px] border backdrop-blur-xl transition-all ${!n.is_read
                    ? `border-l-4 ${unreadBorder[sev] || "border-l-blue-500"} border-t-(--svf-border) border-r-(--svf-border) border-b-(--svf-border)`
                    : "border-(--svf-border)"
                  }`}
                style={{ background: "var(--panel)" }}
              >
                <div className="flex items-start gap-4 px-5 py-4">
                  {/* Severity dot */}
                  <div className={`mt-2 h-2 w-2 rounded-full shrink-0 ${severityDot[sev] || "bg-blue-400"}`} />

                  {/* Icon + content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Icon className="h-4 w-4 shrink-0 text-(--text-faint)" />
                      <p className="font-semibold text-(--text)">{n.title}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${severityBadge[sev] || severityBadge.info}`}>
                        {sev}
                      </span>
                      {!n.is_read && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-(--text-dim) whitespace-pre-wrap">{n.message}</p>
                    <p className="text-xs text-(--text-faint) mt-2">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  {/* Mark read button */}
                  {!n.is_read && (
                    <Button variant="ghost" size="sm" onClick={() => handleMarkRead(n.id)}
                      className="shrink-0 h-7 text-xs text-(--text-faint) hover:text-(--text) hover:bg-(--hover) gap-1">
                      <Check className="h-3 w-3" /> Mark read
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
