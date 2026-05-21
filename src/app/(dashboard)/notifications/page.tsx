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
  expiry_warning:    AlertTriangle,
  rights_renewed:    RefreshCw,
  rights_transferred: ArrowRightLeft,
  movie_added:       Film,
  platform_added:    Building,
  system:            Info,
};

const severityDot: Record<string, string> = {
  info:     "bg-blue-400",
  warning:  "bg-amber-400",
  critical: "bg-red-500",
};

const severityBadge: Record<string, string> = {
  info:     "bg-blue-500/20 text-blue-300 border-blue-500/30",
  warning:  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
};

const unreadBorder: Record<string, string> = {
  info:     "border-l-blue-500",
  warning:  "border-l-amber-500",
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
    <div className="space-y-6">
      {/* ── Cinematic Header ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-indigo-600 via-blue-500 to-transparent" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/6 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative p-3 rounded-xl bg-indigo-500/15 border border-indigo-500/30 shadow-lg shadow-indigo-500/10">
              <Bell className="h-6 w-6 text-indigo-400" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Notifications
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {unreadCount > 0
                  ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                  : "All caught up"}
              </p>
            </div>
          </div>

          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead}
              className="text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 gap-1.5 h-8 shrink-0">
              <Check className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div className="flex items-center gap-2">
        {(["all", "unread"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize ${
              filter === f
                ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                : "bg-slate-800/40 text-slate-400 border-slate-700/40 hover:border-slate-600/60 hover:text-slate-300"
            }`}
          >
            {f === "unread" ? `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}` : "All"}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl p-12 text-center">
          <div className="p-4 rounded-full bg-slate-800/60 border border-slate-700/40 w-fit mx-auto mb-4">
            <Bell className="h-8 w-8 text-slate-500" />
          </div>
          <p className="font-semibold text-slate-300">No notifications</p>
          <p className="text-sm text-slate-500 mt-1">
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
                className={`relative rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl transition-all ${
                  !n.is_read ? `border-l-4 ${unreadBorder[sev] || "border-l-blue-500"} bg-slate-900/60` : ""
                }`}
              >
                <div className="flex items-start gap-4 px-5 py-4">
                  {/* Severity dot */}
                  <div className={`mt-2 h-2 w-2 rounded-full shrink-0 ${severityDot[sev] || "bg-blue-400"}`} />

                  {/* Icon + content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <p className="font-semibold text-slate-100">{n.title}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${severityBadge[sev] || severityBadge.info}`}>
                        {sev}
                      </span>
                      {!n.is_read && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 whitespace-pre-wrap">{n.message}</p>
                    <p className="text-xs text-slate-600 mt-2">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  {/* Mark read button */}
                  {!n.is_read && (
                    <Button variant="ghost" size="sm" onClick={() => handleMarkRead(n.id)}
                      className="shrink-0 h-7 text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 gap-1">
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
