"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Bell,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Info,
} from "lucide-react";
import { useAppToast } from "@/hooks/use-app-toast";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import type { EffectivePreference, NotificationType, GlobalNotificationSettings } from "@/lib/email/notification-service";

const categoryOrder = ["alerts", "activity", "digest", "account"];

const categoryInfo: Record<string, { title: string; description: string }> = {
  alerts: {
    title: "Expiring Rights Alerts",
    description: "Get notified when rights are approaching expiration",
  },
  activity: {
    title: "Activity Updates",
    description: "Stay informed about changes made in the system",
  },
  digest: {
    title: "Summary Emails",
    description: "Periodic summaries of activity and status",
  },
  account: {
    title: "Account Notifications",
    description: "Important account-related emails",
  },
};

const notificationLabels: Record<NotificationType, { title: string; description: string }> = {
  rights_expiring_critical: {
    title: "Critical Expiration (7 days)",
    description: "Rights expiring within the next 7 days",
  },
  rights_expiring_urgent: {
    title: "Urgent Expiration (30 days)",
    description: "Rights expiring within the next 30 days",
  },
  rights_expiring_upcoming: {
    title: "Upcoming Expiration (60 days)",
    description: "Rights expiring within the next 60 days",
  },
  agreement_created: {
    title: "New Agreements",
    description: "When a new agreement is created",
  },
  rights_renewed: {
    title: "Rights Renewed",
    description: "When rights are renewed",
  },
  rights_transferred: {
    title: "Rights Transferred",
    description: "When rights are transferred to another platform",
  },
  movie_created: {
    title: "New Movies",
    description: "When a new movie is added to the catalog",
  },
  daily_digest: {
    title: "Daily Digest",
    description: "Daily summary of activity and expiring rights",
  },
  recensor_reminder: {
    title: "Censor Reminder",
    description: "Monthly reminder for A-certified movies with censor flag",
  },
  user_created: {
    title: "Welcome Email",
    description: "Sent to new users with their credentials",
  },
  password_reset: {
    title: "Password Reset",
    description: "When your password is reset by an administrator",
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
      } catch (err) {
        toast.error("Failed to load notification settings");
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      loadData();
    }
  }, [authLoading, isAdmin]);

  const handleToggle = async (notificationType: NotificationType, newValue: boolean) => {
    setSaving(notificationType);

    try {
      const endpoint = isAdminView ? "/api/notifications/settings" : "/api/notifications/preferences";
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_type: notificationType,
          is_enabled: newValue,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update setting");
      }

      if (isAdminView) {
        setGlobalSettings((prev) =>
          prev.map((s) =>
            s.notification_type === notificationType
              ? { ...s, is_enabled: newValue }
              : s
          )
        );
      } else {
        setPreferences((prev) =>
          prev.map((p) =>
            p.notification_type === notificationType
              ? { ...p, user_enabled: newValue }
              : p
          )
        );
      }

      toast.success("Settings saved successfully!");
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "Failed to update setting");
    } finally {
      setSaving(null);
    }
  };

  const handleRoleToggle = async (notificationType: NotificationType, role: string, currentRoles: string[] | null) => {
    setSaving(`${notificationType}-${role}`);

    const roles = currentRoles || [];
    const newRoles = roles.includes(role)
      ? roles.filter((r) => r !== role)
      : [...roles, role];

    try {
      const response = await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_type: notificationType,
          role_filters: newRoles,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update role filter");
      }

      setGlobalSettings((prev) =>
        prev.map((s) =>
          s.notification_type === notificationType
            ? { ...s, role_filters: newRoles }
            : s
        )
      );

      toast.success("Settings saved successfully!");
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "Failed to update role filter");
    } finally {
      setSaving(null);
    }
  };

  // Group items by category
  const groupedItems = isAdminView
    ? globalSettings.reduce((acc, s) => {
      const cat = s.category || "other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(s);
      return acc;
    }, {} as Record<string, any[]>)
    : preferences.reduce((acc, pref) => {
      const category = pref.category || "other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(pref);
      return acc;
    }, {} as Record<string, EffectivePreference[]>);

  // Count enabled notifications
  const enabledCount = isAdminView
    ? globalSettings.filter(s => s.is_enabled).length
    : preferences.filter((p) => p.globally_enabled && p.user_enabled).length;

  const totalAvailable = isAdminView
    ? globalSettings.length
    : preferences.filter((p) => p.globally_enabled).length;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="relative flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500 relative z-10" />
          <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative">
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Settings
            </Button>
          </Link>
        </div>

        {isAdmin && (
          <div className="flex bg-slate-900/60 border border-slate-800/60 p-1 rounded-lg backdrop-blur-md">
            <Button
              variant={!isAdminView ? "secondary" : "ghost"}
              size="sm"
              className={!isAdminView ? "bg-slate-800 text-white hover:bg-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}
              onClick={() => setIsAdminView(false)}
            >
              My Preferences
            </Button>
            <Button
              variant={isAdminView ? "secondary" : "ghost"}
              size="sm"
              className={isAdminView ? "bg-slate-800 text-white hover:bg-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}
              onClick={() => setIsAdminView(true)}
            >
              Global Settings (Admin)
            </Button>
          </div>
        )}
      </div>

      <div className="relative z-10">
        <h1 className="text-3xl font-bold flex items-center gap-3 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
          <Bell className="h-7 w-7 text-amber-500" />
          {isAdminView ? "Global Notification Settings" : "Notification Preferences"}
        </h1>
        <p className="text-slate-400 mt-2">
          {isAdminView
            ? "Configure system-wide notification defaults and recipient roles"
            : "Choose which notifications you want to receive"}
        </p>
      </div>

      <div className="relative z-10 space-y-8">
        {/* Summary Card */}
        <Card className="border-slate-800/60 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-inner">
                  <Bell className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium text-slate-200 text-lg">
                    {enabledCount} of {totalAvailable} notifications enabled
                  </p>
                  <p className="text-sm text-slate-400">
                    {isAdminView
                      ? "Global configuration for the entire organization"
                      : "You can customize which notifications you receive"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Banner */}
        <Alert className="border-blue-500/20 bg-blue-500/5 backdrop-blur-md">
          <Info className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-200/80 leading-relaxed">
            {isAdminView
              ? "Global settings affect all users. Disabling a notification here will hide it for everyone. Role filters determine who is automatically included in automated alerts."
              : "Your administrator controls which notification types are available. You can choose to receive or skip available notifications."}
          </AlertDescription>
        </Alert>

        {/* Preferences by Category */}
        {(!isAdminView && preferences.length === 0) || (isAdminView && globalSettings.length === 0) ? (
          <Card className="border-slate-800/60 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
            <CardContent className="py-12">
              <div className="text-center text-slate-400">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50 text-slate-400" />
                <p className="font-medium text-slate-300">No notification categories available</p>
                <p className="text-sm mt-1 text-slate-400">
                  Contact your administrator to enable notifications.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          categoryOrder
            .filter((cat) => groupedItems[cat]?.length > 0)
            .map((category) => (
              <Card key={category} className="border-slate-800/60 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
                <CardHeader className="border-b border-slate-800/60 pb-4">
                  <CardTitle className="text-slate-200">{categoryInfo[category]?.title || category}</CardTitle>
                  <CardDescription className="text-slate-400">
                    {categoryInfo[category]?.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {groupedItems[category].map((item: any) => {
                    const notificationType = item.notification_type as NotificationType;
                    const isAlwaysOn = notificationType === "password_reset";
                    const isDisabledByAdmin = !isAdminView && !item.globally_enabled;
                    const label = notificationLabels[notificationType];

                    return (
                      <div
                        key={notificationType}
                        className={`flex flex-col gap-4 p-5 rounded-xl border transition-all ${isDisabledByAdmin
                          ? "bg-slate-950/40 border-slate-800/40 opacity-50"
                          : "bg-slate-950/30 border-slate-800 hover:bg-slate-950/60 hover:border-slate-700"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1">
                            <Checkbox
                              id={notificationType}
                              checked={isAdminView ? item.is_enabled : (item.globally_enabled && item.user_enabled)}
                              onCheckedChange={(checked) => {
                                if (!isAlwaysOn && !isDisabledByAdmin) {
                                  handleToggle(notificationType, checked === true);
                                }
                              }}
                              disabled={
                                isAlwaysOn ||
                                isDisabledByAdmin ||
                                saving === notificationType
                              }
                              className="mt-1 border-slate-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                            />
                            <div className="space-y-1.5">
                              <label
                                htmlFor={notificationType}
                                className="font-medium text-slate-200 cursor-pointer block"
                              >
                                {label?.title || notificationType}
                              </label>
                              <p className="text-sm text-slate-400 leading-relaxed">
                                {label?.description || item.description}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {saving === notificationType && (
                              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                            )}
                            {isAlwaysOn && (
                              <Badge variant="secondary" className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-800">Always On</Badge>
                            )}
                            {!isAdminView && isDisabledByAdmin && (
                              <Badge variant="outline" className="text-slate-400 border-slate-700">Disabled by Admin</Badge>
                            )}
                          </div>
                        </div>

                        {/* Admin-only Role Selection Row */}
                        {isAdminView && !isAlwaysOn && (
                          <div className="mt-2 pt-4 border-t border-slate-800/60 border-dashed">
                            <p className="text-xs font-semibold mb-3 flex items-center gap-2 text-slate-400 uppercase tracking-wider">
                              Recipient Roles
                              <Badge variant="outline" className="text-[9px] h-4 bg-amber-500/10 text-amber-500/80 border-amber-500/20 px-1.5">Admin Only</Badge>
                            </p>
                            <div className="flex flex-wrap gap-2.5">
                              {["admin", "legal", "it", "editor", "viewer"].map((role) => {
                                const isActive = item.role_filters?.includes(role);
                                const isChanging = saving === `${notificationType}-${role}`;
                                return (
                                  <button
                                    key={role}
                                    onClick={() => handleRoleToggle(notificationType, role, item.role_filters)}
                                    disabled={isChanging || !item.is_enabled}
                                    className={`
                                      px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 border
                                      ${isActive
                                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30 shadow-[0_0_15px_-3px_rgba(245,158,11,0.2)]"
                                        : "bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-300"}
                                      ${(!item.is_enabled || isChanging) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                                    `}
                                  >
                                    {isChanging && <Loader2 className="h-3 w-3 animate-spin" />}
                                    <span className="capitalize">{role}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {!item.role_filters?.length && item.is_enabled && (
                              <p className="text-xs text-red-400/80 mt-3 flex items-center gap-1.5 bg-red-500/5 px-2 py-1 rounded inline-flex">
                                <AlertCircle className="h-3.5 w-3.5" /> No roles selected. No one will receive this alert automatically.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))
        )}

        {/* Email Info */}
        <Card className="border-slate-800/60 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
          <CardHeader className="border-b border-slate-800/60 pb-4">
            <CardTitle className="text-base text-slate-200 flex items-center gap-2">
              <Info className="h-4 w-4 text-slate-400" />
              About Email Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-400 space-y-3 pt-5 leading-relaxed">
            <p>
              Notifications are sent to your registered email address. If you&apos;re
              not receiving emails, please check your spam folder.
            </p>
            <p>
              Critical alerts (rights expiring within 7 days) are sent immediately
              when detected. Daily digest emails are sent once per day in the morning.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
