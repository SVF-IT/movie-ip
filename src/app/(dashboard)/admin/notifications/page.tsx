"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import type { GlobalNotificationSettings, NotificationType } from "@/lib/email/notification-service";
import {
  Activity,
  AlertTriangle,
  Bell,
  Clock,
  Loader2,
  Mail,
  Send,
  Settings2,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const categoryLabels: Record<string, { label: string; icon: React.ElementType; desc: string; color: string; bg: string; border: string }> = {
  alerts: { label: "Alerts", icon: AlertTriangle, desc: "Urgent notifications about expiring rights", color: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/30" },
  activity: { label: "Activity", icon: Activity, desc: "Updates about changes in the system", color: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/30" },
  digest: { label: "Digest", icon: Clock, desc: "Scheduled summary emails", color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/30" },
  account: { label: "Account", icon: User, desc: "User account related notifications", color: "text-violet-400", bg: "bg-violet-500/15", border: "border-violet-500/30" },
};

const notificationDescriptions: Record<NotificationType, string> = {
  rights_expiring_critical: "Rights expiring within 7 days (critical)",
  rights_expiring_urgent: "Rights expiring within 30 days (urgent)",
  rights_expiring_upcoming: "Rights expiring within 60 days (upcoming)",
  movie_created: "New movie added to the catalog",
  daily_digest: "Daily summary of activity and expiring rights",
  recensor_reminder: "Monthly reminder for A-certified movies with censor flag",
  user_created: "Welcome email to new users (includes credentials)",
  password_reset: "Password reset notifications (always enabled)",
};

export default function AdminNotificationsPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<GlobalNotificationSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [testingSend, setTestingSend] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/notifications/settings");
        if (!response.ok) throw new Error("Failed to load settings");
        const data = await response.json();
        setSettings(data.settings);
      } catch {
        toast.error("Failed to load notification settings. Make sure the database tables are set up.");
      } finally {
        setLoading(false);
      }
    };
    if (isAdmin) loadSettings();
  }, [isAdmin]);

  const handleToggle = async (notificationType: NotificationType, newValue: boolean) => {
    if (notificationType === "password_reset") return;
    setSaving(notificationType);
    try {
      const response = await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_type: notificationType, is_enabled: newValue }),
      });
      if (!response.ok) throw new Error("Failed to update setting");
      setSettings((prev) =>
        prev.map((s) => s.notification_type === notificationType ? { ...s, is_enabled: newValue } : s)
      );
    } catch {
      toast.error("Failed to update setting");
    } finally {
      setSaving(null);
    }
  };

  const handleTestAlerts = async () => {
    setTestingSend(true);
    try {
      const response = await fetch("/api/notifications/send-alerts", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || "test"}` },
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Sent ${data.sent} alerts (${data.errors} errors)`);
      } else {
        toast.error(data.error || "Failed to send alerts");
      }
    } catch {
      toast.error("Failed to send test alerts");
    } finally {
      setTestingSend(false);
    }
  };

  const settingsByCategory = settings.reduce((acc, s) => {
    const cat = s.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {} as Record<string, GlobalNotificationSettings[]>);

  const isConfigured = process.env.NEXT_PUBLIC_RESEND_CONFIGURED === "true";
  const enabledCount = settings.filter(s => s.is_enabled).length;

  if (authLoading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-red-500/10 border border-red-500/30 max-w-md">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-300">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Cinematic Header ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-3">

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-500/30 shadow-lg shadow-indigo-500/10">
              <Bell className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-(--text)">
                Notification Settings
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">Configure which notifications are available for users</p>
            </div>
          </div>

          <Button size="sm" onClick={handleTestAlerts} disabled={testingSend}
            className="bg-indigo-600 hover:bg-indigo-500 text-white border-0 shadow-lg shadow-indigo-900/30 h-8 shrink-0">
            {testingSend
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Sending...</>
              : <><Send className="mr-1.5 h-3.5 w-3.5" />Send Test Alerts</>}
          </Button>
        </div>

        {/* Stat cards */}
        <div className="relative mt-5 flex gap-3">
          <div className="flex-1 rounded-lg bg-slate-800/30 border border-slate-700/30 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Total Types</div>
            <div className="text-xl font-bold text-slate-100 tabular-nums">{settings.length}</div>
          </div>
          <div className="flex-1 rounded-lg bg-slate-800/30 border border-slate-700/30 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Enabled</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums">{enabledCount}</div>
          </div>
          <div className="flex-1 rounded-lg bg-slate-800/30 border border-slate-700/30 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Email Service</div>
            <div className={`text-sm font-bold ${isConfigured ? "text-emerald-400" : "text-red-400"}`}>
              {isConfigured ? "Configured" : "Not Configured"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Email Config Status ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/60">
          <div className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30">
            <Mail className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">Email Configuration</span>
          <span className={`ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${isConfigured
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              : "bg-slate-700/40 text-slate-400 border-slate-600/30"
            }`}>
            {isConfigured ? "Configured" : "Not Configured"}
          </span>
        </div>
        <div className="px-5 py-4 text-sm text-slate-400">
          Emails are sent via Resend.com. Set <code className="text-slate-300 bg-slate-800/60 px-1.5 py-0.5 rounded text-xs">RESEND_API_KEY</code> in environment variables.
        </div>
      </div>

      {/* ── Settings by category ── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        </div>
      ) : settings.length === 0 ? (
        <div className="rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl p-12 text-center">
          <div className="p-4 rounded-full bg-slate-800/60 border border-slate-700/40 w-fit mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-slate-500" />
          </div>
          <p className="font-semibold text-slate-300">No notification settings found</p>
          <p className="text-sm text-slate-500 mt-1">
            Run the database migration to create the notification_settings table.
          </p>
        </div>
      ) : (
        Object.entries(settingsByCategory).map(([category, categorySettings]) => {
          const cfg = categoryLabels[category] ?? { label: category, icon: Bell, desc: "", color: "text-slate-400", bg: "bg-slate-700/40", border: "border-slate-600/30" };
          const CategoryIcon = cfg.icon;
          return (
            <div key={category} className="relative overflow-hidden rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl shadow-xl">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/60">
                <div className={`p-1.5 rounded-lg ${cfg.bg} border ${cfg.border}`}>
                  <CategoryIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
                </div>
                <div>
                  <span className="text-sm font-semibold text-slate-200">{cfg.label}</span>
                  {cfg.desc && <span className="ml-2 text-xs text-slate-500">{cfg.desc}</span>}
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader style={{ background: "var(--bg-deep)" }}>
                    <TableRow className="border-(--svf-border) hover:bg-transparent">
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Notification Type</TableHead>
                      <TableHead className="hidden md:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Description</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categorySettings.map((setting) => (
                      <TableRow key={setting.notification_type} className="border-(--svf-border) hover:bg-(--hover) transition-colors">
                        <TableCell>
                          <span className="font-medium text-slate-200 capitalize">
                            {setting.notification_type.replace(/_/g, " ")}
                          </span>
                          <span className="block text-xs text-slate-500 md:hidden mt-0.5">
                            {notificationDescriptions[setting.notification_type]}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-slate-400">
                          {notificationDescriptions[setting.notification_type]}
                        </TableCell>
                        <TableCell className="text-right">
                          {setting.notification_type === "password_reset" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/40 text-slate-400 border border-slate-600/30">
                              Always On
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              {saving === setting.notification_type && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                              )}
                              <Switch
                                checked={setting.is_enabled}
                                onCheckedChange={(checked) => handleToggle(setting.notification_type, checked)}
                                disabled={saving === setting.notification_type}
                              />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })
      )}

      {/* ── Setup Instructions ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/60">
          <div className="p-1.5 rounded-lg bg-slate-700/40 border border-slate-600/40">
            <Settings2 className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">Setup Instructions</span>
        </div>
        <div className="p-5 space-y-5 text-sm text-slate-400">
          <div className="space-y-2">
            <p className="font-semibold text-slate-300">1. Environment Variables</p>
            <pre className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3 text-xs overflow-x-auto text-slate-300 font-mono">
              {`RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM="Film IP Manager <notifications@yourdomain.com>"
CRON_SECRET=your-secure-secret
NEXT_PUBLIC_APP_URL=https://yourdomain.com`}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-slate-300">2. Scheduled Jobs (Vercel Cron)</p>
            <pre className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3 text-xs overflow-x-auto text-slate-300 font-mono">
              {`// vercel.json
{
  "crons": [
    { "path": "/api/notifications/send-alerts",  "schedule": "0 9 * * *" },
    { "path": "/api/notifications/daily-digest", "schedule": "0 8 * * *" }
  ]
}`}
            </pre>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-slate-300">3. Database Tables</p>
            <p>See <code className="text-slate-300 bg-slate-800/60 px-1.5 py-0.5 rounded text-xs">sql-migration.md</code> for the notification_settings and user_notification_preferences table schemas.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
