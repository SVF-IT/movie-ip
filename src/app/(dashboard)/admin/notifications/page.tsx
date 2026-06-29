"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import type { GlobalNotificationSettings, NotificationType } from "@/lib/email/notification-service";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  User,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const categoryOrder = ["alerts", "activity", "digest", "account", "special_events"];

const categoryConfig: Record<string, {
  label: string;
  icon: React.ElementType;
  desc: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
}> = {
  alerts: { label: "Alerts", icon: AlertTriangle, desc: "Expiring rights notifications", accent: "text-red-600", accentBg: "bg-red-50", accentBorder: "border-red-200" },
  activity: { label: "Activity", icon: Bell, desc: "System change updates", accent: "text-blue-600", accentBg: "bg-blue-50", accentBorder: "border-blue-200" },
  digest: { label: "Digest", icon: Clock, desc: "Scheduled summary emails", accent: "text-amber-600", accentBg: "bg-amber-50", accentBorder: "border-amber-200" },
  account: { label: "Account", icon: User, desc: "User account emails", accent: "text-violet-600", accentBg: "bg-violet-50", accentBorder: "border-violet-200" },
  special_events: { label: "Special Events", icon: Sparkles, desc: "Movie anniversaries & milestones", accent: "text-emerald-600", accentBg: "bg-emerald-50", accentBorder: "border-emerald-200" },
};

const notificationLabels: Record<string, { title: string; description: string }> = {
  rights_expiring_critical: { title: "Critical — 7 days", description: "Rights expiring within 7 days" },
  rights_expiring_urgent: { title: "Urgent — 30 days", description: "Rights expiring within 30 days" },
  rights_expiring_upcoming: { title: "Upcoming — 60 days", description: "Rights expiring within 60 days" },
  agreement_created: { title: "New Agreements", description: "When a new rights agreement is created" },
  movie_created: { title: "New Movies", description: "When a new movie is added to the catalog" },
  daily_digest: { title: "Daily Digest", description: "Morning summary of activity and expiring rights" },
  recensor_reminder: { title: "Censor Reminder", description: "Monthly reminder for A-certified movies with censor flag" },
  user_created: { title: "Welcome Email", description: "Sent to new users with their login credentials" },
  password_reset: { title: "Password Reset", description: "When a user's password is reset — always sent" },
  anniversary_notification: { title: "Anniversary & Milestone", description: "Email + banner for upcoming movie anniversaries" },
};

export default function AdminNotificationsPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<GlobalNotificationSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [testingSend, setTestingSend] = useState(false);
  const [testingAnniversary, setTestingAnniversary] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/notifications/settings")
      .then(r => r.ok ? r.json() : Promise.reject("Failed"))
      .then(data => setSettings(data.settings))
      .catch(() => toast.error("Failed to load notification settings"))
      .finally(() => setLoading(false));
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
      if (!response.ok) throw new Error("Failed to update");
      setSettings(prev => prev.map(s => s.notification_type === notificationType ? { ...s, is_enabled: newValue } : s));
      toast.success("Saved");
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

  const handleTestAnniversary = async (mode: "mock" | "real") => {
    setTestingAnniversary(true);
    try {
      const response = await fetch("/api/notifications/test-anniversary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await response.json();
      if (response.ok) {
        if (mode === "mock") {
          toast.success(`Mock anniversary sent to your bell${data.emailSent ? " + email" : ""}`);
        } else {
          toast.success(`Real scan: ${data.sent} sent (${data.errors} errors)`);
        }
      } else {
        toast.error(data.error || "Failed");
      }
    } catch {
      toast.error("Failed to send test anniversary");
    } finally {
      setTestingAnniversary(false);
    }
  };

  const settingsByCategory = settings.reduce((acc, s) => {
    const cat = s.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {} as Record<string, GlobalNotificationSettings[]>);

  const isResendConfigured = process.env.NEXT_PUBLIC_RESEND_CONFIGURED === "true";
  const enabledCount = settings.filter(s => s.is_enabled).length;

  if (authLoading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-(--svf-accent)" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-(--svf-accent-soft) border border-(--svf-accent-line)">
            <Bell className="h-5 w-5 text-(--svf-accent-bright)" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-(--text)">Notification Settings</h1>
            <p className="text-sm text-(--text-faint) mt-0.5">
              {settings.length > 0
                ? `${enabledCount} of ${settings.length} notification types enabled`
                : "Configure which notifications are available for users"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => handleTestAnniversary("mock")}
            disabled={testingAnniversary}
            variant="outline"
            className="border-(--svf-border) text-(--text-dim) hover:text-(--text) hover:bg-(--hover)"
          >
            {testingAnniversary
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Sending…</>
              : <><Sparkles className="mr-1.5 h-3.5 w-3.5" />Test Anniversary</>}
          </Button>
          <Button
            size="sm"
            onClick={handleTestAlerts}
            disabled={testingSend}
            variant="outline"
            className="border-(--svf-border) text-(--text-dim) hover:text-(--text) hover:bg-(--hover)"
          >
            {testingSend
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Sending…</>
              : <><Send className="mr-1.5 h-3.5 w-3.5" />Send Test Alerts</>}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-(--svf-border) bg-(--bg-raise) px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) mb-1">Total Types</p>
          <p className="text-2xl font-bold text-(--text) tabular-nums">{settings.length}</p>
        </div>
        <div className="rounded-xl border border-(--svf-border) bg-(--bg-raise) px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) mb-1">Enabled</p>
          <p className="text-2xl font-bold text-emerald-600 tabular-nums">{enabledCount}</p>
        </div>
        <div className="rounded-xl border border-(--svf-border) bg-(--bg-raise) px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) mb-1">Email Service</p>
          <div className={`flex items-center gap-1.5 mt-1 text-sm font-semibold ${isResendConfigured ? "text-emerald-600" : "text-red-500"}`}>
            {isResendConfigured
              ? <><CheckCircle2 className="h-4 w-4" />Configured</>
              : <><XCircle className="h-4 w-4" />Not set up</>}
          </div>
        </div>
      </div>

      {/* Email service info */}
      <div className="rounded-xl border border-(--svf-border) bg-(--bg-raise) overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-(--svf-border) bg-(--bg-deep)">
          <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-200">
            <Mail className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <span className="text-sm font-semibold text-(--text)">Email Configuration</span>
          <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${isResendConfigured
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-red-50 text-red-600 border-red-200"
            }`}>
            {isResendConfigured ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
            {isResendConfigured ? "Configured" : "Not Configured"}
          </span>
        </div>
        <div className="px-4 py-3 text-sm text-(--text-faint)">
          Emails are sent via Resend. Add{" "}
          <code className="text-(--text-dim) bg-(--bg-deep) border border-(--svf-border) px-1.5 py-0.5 rounded text-xs font-mono">RESEND_API_KEY</code>
          {" "}and{" "}
          <code className="text-(--text-dim) bg-(--bg-deep) border border-(--svf-border) px-1.5 py-0.5 rounded text-xs font-mono">NEXT_PUBLIC_RESEND_CONFIGURED=true</code>
          {" "}to your environment variables.
        </div>
      </div>

      {/* Settings by category */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-(--svf-accent)" />
        </div>
      ) : settings.length === 0 ? (
        <div className="rounded-xl border border-(--svf-border) bg-(--bg-raise) py-16 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-(--text-faint) opacity-40" />
          <p className="text-sm font-semibold text-(--text)">No notification settings found</p>
          <p className="text-xs text-(--text-faint) mt-1">Run migration 25 in the Supabase SQL editor to seed the table.</p>
        </div>
      ) : (
        categoryOrder
          .filter(cat => settingsByCategory[cat]?.length > 0)
          .map(category => {
            const cfg = categoryConfig[category] ?? {
              label: category,
              icon: Bell,
              desc: "",
              accent: "text-(--text-faint)",
              accentBg: "bg-(--bg-deep)",
              accentBorder: "border-(--svf-border)",
            };
            const CategoryIcon = cfg.icon;

            return (
              <div key={category} className="rounded-xl border border-(--svf-border) bg-(--bg-raise) overflow-hidden">
                {/* Category header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-(--svf-border) bg-(--bg-deep)">
                  <div className={`p-1.5 rounded-lg ${cfg.accentBg} border ${cfg.accentBorder}`}>
                    <CategoryIcon className={`h-3.5 w-3.5 ${cfg.accent}`} />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-(--text)">{cfg.label}</span>
                    {cfg.desc && <span className="ml-2 text-xs text-(--text-faint)">{cfg.desc}</span>}
                  </div>
                </div>

                {/* Rows */}
                <div className="divide-y divide-(--svf-border)">
                  {settingsByCategory[category].map(setting => {
                    const isAlwaysOn = setting.notification_type === "password_reset";
                    const label = notificationLabels[setting.notification_type];
                    const isSaving = saving === setting.notification_type;

                    return (
                      <div
                        key={setting.notification_type}
                        className="flex items-start justify-between gap-4 px-4 py-3.5 hover:bg-(--hover) transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-(--text)">
                              {label?.title || setting.notification_type.replace(/_/g, " ")}
                            </span>
                            {isAlwaysOn && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-(--bg-deep) border border-(--svf-border) text-(--text-faint)">
                                <ShieldCheck className="h-2.5 w-2.5" />
                                Always on
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-(--text-faint) mt-0.5">
                            {label?.description || setting.description}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 mt-0.5 shrink-0">
                          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-(--text-faint)" />}
                          {isAlwaysOn ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-(--bg-deep) border border-(--svf-border) text-(--text-faint)">
                              Always On
                            </span>
                          ) : (
                            <Switch
                              checked={setting.is_enabled}
                              onCheckedChange={checked => handleToggle(setting.notification_type, checked)}
                              disabled={isSaving}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
      )}

      {/* Setup instructions */}
      <div className="rounded-xl border border-(--svf-border) bg-(--bg-raise) overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-(--svf-border) bg-(--bg-deep)">
          <div className="p-1.5 rounded-lg bg-(--bg-deep) border border-(--svf-border)">
            <Settings2 className="h-3.5 w-3.5 text-(--text-faint)" />
          </div>
          <span className="text-sm font-semibold text-(--text)">Environment Variables</span>
        </div>
        <div className="p-4">
          <pre className="bg-(--bg-deep) border border-(--svf-border) rounded-lg p-3 text-xs overflow-x-auto text-(--text-dim) font-mono leading-relaxed">
            {`RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM="Movie IP Manager <notifications@svf.in>"
NEXT_PUBLIC_RESEND_CONFIGURED=true
NEXT_PUBLIC_APP_URL=https://movies-ip.svf.in`}
          </pre>
        </div>
      </div>

    </div>
  );
}
