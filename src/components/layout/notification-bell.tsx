"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, Check, AlertTriangle, Info, RefreshCw, ArrowRightLeft, Film, Building } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  getUnreadNotifications,
  getNotificationCount,
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

const severityColors: Record<string, string> = {
  info: "bg-blue-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const c = await getNotificationCount();
      setCount(c);
    } catch {
      // Silently fail — table may not exist yet
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUnreadNotifications();
      setNotifications(data);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    await markAsRead(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    setNotifications([]);
    setCount(0);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-slate-800 hover:text-slate-200 transition-colors">
          <Bell className="h-5 w-5 text-slate-400" />
          {count > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full p-0 text-xs flex items-center justify-center animate-pulse border-none bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
            >
              {count > 9 ? "9+" : count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 bg-slate-900/95 backdrop-blur-xl border-slate-800/60 shadow-2xl rounded-xl overflow-hidden"
        align="end"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800/60 bg-slate-950/50">
          <h4 className="font-semibold text-sm text-slate-200 tracking-wide">Notifications</h4>
          {count > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7 text-slate-400 hover:text-slate-200 hover:bg-slate-800" onClick={handleMarkAllRead}>
              <Check className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400 animate-pulse">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center space-y-2">
              <Bell className="h-8 w-8 text-slate-700/50 mb-2" />
              <p className="text-sm font-medium text-slate-400">All caught up</p>
              <p className="text-xs text-slate-400">No new notifications</p>
            </div>
          ) : (
            notifications.map((n) => {
              const Icon = typeIcons[n.type] || Info;
              return (
                <div
                  key={n.id}
                  className="flex gap-3 p-4 border-b border-slate-800/40 last:border-0 hover:bg-slate-800/50 transition-colors group relative"
                >
                  <div
                    className={`mt-1 h-2 w-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor] ${severityColors[n.severity] || severityColors.info
                      }`}
                  />
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-start gap-1.5 mb-1">
                      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
                      <p className="text-sm font-medium leading-tight text-slate-200">{n.title}</p>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2 leading-relaxed opacity-90">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-2 font-medium tracking-wide">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0 absolute right-3 top-4 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-green-400 hover:bg-green-400/10"
                    onClick={() => handleMarkRead(n.id)}
                    title="Mark as read"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="p-2 border-t border-slate-800/60 bg-slate-950/20">
          <Button variant="ghost" size="sm" className="w-full text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800" asChild>
            <Link href="/admin/notifications" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
