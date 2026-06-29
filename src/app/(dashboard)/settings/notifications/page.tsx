"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import type { EffectivePreference, GlobalNotificationSettings, NotificationType } from "@/lib/email/notification-service";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellOff,
  Clock,
  Info,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const categoryOrder = ["alerts", "activity", "digest", "account", "special_events"];

const categoryConfig: Record<string, {
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
}> = {
  alerts: {
    title: "Expiring Rights Alerts",
    description: "Get notified when rights are approaching expiration",
    icon: AlertTriangle,
    accent: "text-red-600",
    accentBg: "bg-red-50",
    accentBorder: "border-red-200",
    accentText: "text-red-700",
  },
  activity: {
    title: "Activity Updates",
    description: "Stay informed about changes made in the system",
    icon: Bell,
    accent: "text-blue-600",
    accentBg: "bg-blue-50",
    accentBorder: "border-blue-200",
    accentText: "text-blue-700",
  },
  digest: {
    title: "Summary Emails",
    description: "Periodic summaries of activity and status",
    icon: Clock,
    accent: "text-amber-600",
    accentBg: "bg-amber-50",
    accentBorder: "border-amber-200",
    accentText: "text-amber-700",
  },
  account: {
    title: "Account Notifications",
    description: "Important account-related emails",
    icon: User,
    accent: "text-violet-600",
    accentBg: "bg-violet-50",
    accentBorder: "border-violet-200",
    accentText: "text-violet-700",
  },
  special_events: {
    title: "Special Events",
    description: "Movie anniversaries and milestone celebrations",
    icon: Sparkles,
    accent: "text-emerald-600",
    accentBg: "bg-emerald-50",
    accentBorder: "border-emerald-200",
    accentText: "text-emerald-700",
  },
};

const notificationLabels: Record<string, { title: string; description: string }> = {
  rights_expiring_critical: {
    title: "Critical — 7 days",
    description: "Rights expiring within the next 7 days",
  },
  rights_expiring_urgent: {
    title: "Urgent — 30 days",
    description: "Rights expiring within the next 30 days",
  },
  rights_expiring_upcoming: {
    title: "Upcoming — 60 days",
    description: "Rights expiring within the next 60 days",
  },
  agreement_created: {
    title: "New Agreements",
    description: "When a new rights agreement is created",
  },
  movie_created: {
    title: "New Movies",
    description: "When a new movie is added to the catalog",
  },
  daily_digest: {
    title: "Daily Digest",
    description: "Morning summary of activity and expiring rights",
  },
  recensor_reminder: {
    title: "Censor Reminder",
    description: "Monthly reminder for A-certified movies with censor flag",
  },
  user_created: {
    title: "Welcome Email",
    description: "Sent to new users with their login credentials",
  },
  password_reset: {
    title: "Password Reset",
    description: "When your password is reset by an administrator",
  },
  anniversary_notification: {
    title: "Anniversary & Milestone",
    description: "Special Events banner and email for upcoming movie anniversaries",
  },
};

export default function NotificationPreferencesPage() {
  const { profile, loading: authLoading } = useAuth();
  const [preferences, setPreferences] = useState<EffectivePreference[]>([]);
  const [globalSettings, setGlobalSettings] = useState<GlobalNotificationSettings[]>([]);
  const [isAdminView, setIsAdminView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const toast = useAppToast();

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [prefsRes, settingsRes] = await Promise.all([
          fetch("/api/notifications/preferences"),
          isAdmin ? fetch("/api/notifications/settings") : Promise.resolve(null),
        ]);

        if (!prefsRes.ok) throw new Error("Failed to load preferences");
        const prefsData = await prefsRes.json();
        setPreferences(prefsData.preferences);

        if (settingsRes && settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setGlobalSettings(settingsData.settings);
        }
      } catch {
        toast.error("Failed to load notification settings");
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) loadData();
  }, [authLoading, isAdmin]);

  const handleToggle = async (notificationType: NotificationType, newValue: boolean) => {
    setSaving(notificationType);
    try {
      const endpoint = isAdminView
        ? "/api/notifications/settings"
        : "/api/notifications/preferences";
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_type: notificationType, is_enabled: newValue }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update setting");
      }

      if (isAdminView) {
        setGlobalSettings(prev =>
          prev.map(s => s.notification_type === notificationType ? { ...s, is_enabled: newValue } : s)
        );
      } else {
        setPreferences(prev =>
          prev.map(p => p.notification_type === notificationType ? { ...p, user_enabled: newValue } : p)
        );
      }
      toast.success("Saved");
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "Failed to update");
    } finally {
      setSaving(null);
    }
  };

  const handleRoleToggle = async (notificationType: NotificationType, role: string, currentRoles: string[] | null) => {
    setSaving(`${notificationType}-${role}`);
    const roles = currentRoles || [];
    const newRoles = roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role];
    try {
      const response = await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_type: notificationType, role_filters: newRoles }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update role filter");
      }
      setGlobalSettings(prev =>
        prev.map(s => s.notification_type === notificationType ? { ...s, role_filters: newRoles } : s)
      );
      toast.success("Saved");
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "Failed to update");
    } finally {
      setSaving(null);
    }
  };

  const groupedItems = isAdminView
    ? globalSettings.reduce((acc, s) => {
        const cat = s.category || "other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(s);
        return acc;
      }, {} as Record<string, any[]>)
    : preferences.reduce((acc, pref) => {
        const cat = pref.category || "other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(pref);
        return acc;
      }, {} as Record<string, EffectivePreference[]>);

  const enabledCount = isAdminView
    ? globalSettings.filter(s => s.is_enabled).length
    : preferences.filter(p => p.globally_enabled && p.user_enabled).length;
  const totalAvailable = isAdminView
    ? globalSettings.length
    : preferences.filter(p => p.globally_enabled).length;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-(--svf-accent)" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover) -ml-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Settings
            </Button>
          </Link>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1 bg-(--bg-deep) border border-(--svf-border) rounded-lg p-1">
            <button
              onClick={() => setIsAdminView(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                !isAdminView
                  ? "bg-(--bg-raise) text-(--text) shadow-sm border border-(--svf-border)"
                  : "text-(--text-faint) hover:text-(--text)"
              }`}
            >
              My Preferences
            </button>
            <button
              onClick={() => setIsAdminView(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                isAdminView
                  ? "bg-(--bg-raise) text-(--text) shadow-sm border border-(--svf-border)"
                  : "text-(--text-faint) hover:text-(--text)"
              }`}
            >
              Global Settings
            </button>
          </div>
        )}
      </div>

      {/* Page title + summary */}
      <div className="flex items-start gap-4 px-1">
        <div className="p-2.5 rounded-xl bg-(--svf-accent-soft) border border-(--svf-accent-line)">
          <Bell className="h-5 w-5 text-(--svf-accent-bright)" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-(--text)">
            {isAdminView ? "Global Notification Settings" : "Notification Preferences"}
          </h1>
          <p className="text-sm text-(--text-faint) mt-0.5">
            {isAdminView
              ? "Control which notifications are available organisation-wide"
              : `${enabledCount} of ${totalAvailable} notifications enabled`}
          </p>
        </div>
      </div>

      {/* Info strip */}
      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <span>
          {isAdminView
            ? "Disabling a type here removes it for all users. Role filters control who receives automated alerts."
            : "Your admin controls which types are available. You can opt out of any enabled type below."}
        </span>
      </div>

      {/* Category sections */}
      {categoryOrder
        .filter(cat => groupedItems[cat]?.length > 0)
        .map(category => {
          const cfg = categoryConfig[category] ?? {
            title: category,
            description: "",
            icon: Bell,
            accent: "text-(--text-faint)",
            accentBg: "bg-(--bg-deep)",
            accentBorder: "border-(--svf-border)",
            accentText: "text-(--text-dim)",
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
                  <p className="text-sm font-semibold text-(--text)">{cfg.title}</p>
                  <p className="text-xs text-(--text-faint)">{cfg.description}</p>
                </div>
              </div>

              {/* Items */}
              <div className="divide-y divide-(--svf-border)">
                {groupedItems[category].map((item: any) => {
                  const notificationType = item.notification_type as NotificationType;
                  const isAlwaysOn = notificationType === "password_reset";
                  const isDisabledByAdmin = !isAdminView && !item.globally_enabled;
                  const label = notificationLabels[notificationType];
                  const isChecked = isAdminView ? item.is_enabled : (item.globally_enabled && item.user_enabled);
                  const isSaving = saving === notificationType;

                  return (
                    <div
                      key={notificationType}
                      className={`px-4 py-3.5 transition-colors ${
                        isDisabledByAdmin ? "opacity-50 bg-(--bg-deep)" : "hover:bg-(--hover)"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-(--text)">
                              {label?.title || notificationType}
                            </span>
                            {isAlwaysOn && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-(--bg-deep) border border-(--svf-border) text-(--text-faint)">
                                <ShieldCheck className="h-2.5 w-2.5" />
                                Always on
                              </span>
                            )}
                            {!isAdminView && isDisabledByAdmin && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600">
                                <BellOff className="h-2.5 w-2.5" />
                                Disabled by admin
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-(--text-faint) mt-0.5 leading-relaxed">
                            {label?.description || item.description}
                          </p>

                          {/* Admin role filter row */}
                          {isAdminView && !isAlwaysOn && (
                            <div className="mt-3 pt-3 border-t border-(--svf-border) border-dashed">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) mb-2">
                                Recipients
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {["admin", "legal", "it", "editor", "viewer"].map(role => {
                                  const isActive = item.role_filters?.includes(role);
                                  const isChanging = saving === `${notificationType}-${role}`;
                                  return (
                                    <button
                                      key={role}
                                      onClick={() => handleRoleToggle(notificationType, role, item.role_filters)}
                                      disabled={isChanging || !item.is_enabled}
                                      className={`
                                        inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                                        ${isActive
                                          ? `${cfg.accentBg} ${cfg.accentBorder} ${cfg.accentText}`
                                          : "bg-(--bg-deep) border-(--svf-border) text-(--text-faint) hover:text-(--text) hover:bg-(--hover)"}
                                        ${(!item.is_enabled || isChanging) ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                                      `}
                                    >
                                      {isChanging && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                      <span className="capitalize">{role}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {!item.role_filters?.length && item.is_enabled && (
                                <p className="text-xs text-red-600 mt-2 flex items-center gap-1.5">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  No roles selected — no one will receive this automatically
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-0.5 shrink-0">
                          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-(--text-faint)" />}
                          <Switch
                            checked={isChecked}
                            onCheckedChange={checked => {
                              if (!isAlwaysOn && !isDisabledByAdmin) {
                                handleToggle(notificationType, checked);
                              }
                            }}
                            disabled={isAlwaysOn || isDisabledByAdmin || isSaving}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

      {/* Empty state */}
      {categoryOrder.every(cat => !groupedItems[cat]?.length) && (
        <div className="rounded-xl border border-(--svf-border) bg-(--bg-raise) py-16 text-center">
          <Bell className="h-8 w-8 mx-auto mb-3 text-(--text-faint) opacity-40" />
          <p className="text-sm font-medium text-(--text)">No notifications available</p>
          <p className="text-xs text-(--text-faint) mt-1">Contact your administrator to enable notifications.</p>
        </div>
      )}

      {/* Footer note */}
      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-(--bg-deep) border border-(--svf-border) text-sm text-(--text-faint)">
        <Mail className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Emails are sent to your registered address. Check your spam folder if you&apos;re not receiving them.
          Critical alerts (7-day expiry) are sent immediately; digests go out once each morning.
        </span>
      </div>
    </div>
  );
}
