/**
 * Notification Service
 * Handles sending notifications based on user preferences
 * Admin configures global settings, users can select which ones to receive (but not disable all)
 */

import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendEmail, sendBatchEmails, type EmailOptions } from "./resend";
import {
  rightsExpiringTemplate,
  userCreatedTemplate,
  movieCreatedTemplate,
  dailyDigestTemplate,
  passwordResetTemplate,
  type RightsExpiringData,
  type UserCreatedData,
  type MovieCreatedData,
  type DailyDigestData,
  type PasswordResetData,
} from "./templates";

// Re-export types used by API routes
export type { DailyDigestData };

// Notification types that can be configured
export type NotificationType =
  | "rights_expiring_critical"  // Within 7 days
  | "rights_expiring_urgent"    // Within 30 days
  | "rights_expiring_upcoming"  // Within 60 days
  | "movie_created"
  | "daily_digest"
  | "recensor_reminder"         // Monthly, for A-certified movies with recensor_flag=true
  | "user_created"              // Admin only
  | "password_reset";           // Always sent, cannot be disabled

// Global notification settings (admin configurable)
export interface GlobalNotificationSettings {
  id: string;
  notification_type: NotificationType;
  is_enabled: boolean;
  description: string;
  category: "alerts" | "activity" | "digest" | "account";
  role_filters: string[] | null;
  created_at: string;
  updated_at: string;
}

// User notification preferences
export interface UserNotificationPreference {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Combined preference (global + user)
export interface EffectivePreference {
  notification_type: NotificationType;
  globally_enabled: boolean;
  user_enabled: boolean;
  description: string;
  category: string;
}

/**
 * Get global notification settings (admin configured)
 */
export async function getGlobalNotificationSettings(): Promise<GlobalNotificationSettings[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .order("category", { ascending: true });

  if (error) {
    console.error("Error fetching global notification settings:", error);
    return [];
  }

  return data || [];
}

/**
 * Update global notification setting (admin only)
 */
export async function updateGlobalNotificationSetting(
  notificationType: NotificationType,
  updates: { is_enabled?: boolean; role_filters?: string[] | null }
): Promise<boolean> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("notification_settings")
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq("notification_type", notificationType);

  if (error) {
    console.error("Error updating global notification setting:", error);
    return false;
  }

  return true;
}

/**
 * Get user notification preferences
 */
export async function getUserNotificationPreferences(
  userId: string
): Promise<UserNotificationPreference[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching user notification preferences:", error);
    return [];
  }

  return data || [];
}

/**
 * Update user notification preference
 */
export async function updateUserNotificationPreference(
  userId: string,
  notificationType: NotificationType,
  isEnabled: boolean
): Promise<boolean> {
  const supabase = await createServerClient();

  // Upsert the preference
  const { error } = await supabase
    .from("user_notification_preferences")
    .upsert(
      {
        user_id: userId,
        notification_type: notificationType,
        is_enabled: isEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,notification_type" }
    );

  if (error) {
    console.error("Error updating user notification preference:", error);
    return false;
  }

  return true;
}

/**
 * Get effective preferences for a user (combining global and user settings)
 */
export async function getEffectivePreferences(
  userId: string
): Promise<EffectivePreference[]> {
  const [globalSettings, userPrefs] = await Promise.all([
    getGlobalNotificationSettings(),
    getUserNotificationPreferences(userId),
  ]);

  const userPrefMap = new Map(
    userPrefs.map((p) => [p.notification_type, p.is_enabled])
  );

  return globalSettings.map((setting) => ({
    notification_type: setting.notification_type,
    globally_enabled: setting.is_enabled,
    user_enabled: userPrefMap.get(setting.notification_type) ?? true, // Default to true if no preference
    description: setting.description,
    category: setting.category,
  }));
}

/**
 * Check if a user should receive a specific notification type
 */
export async function shouldSendNotification(
  userId: string,
  notificationType: NotificationType
): Promise<boolean> {
  // Password reset is always sent
  if (notificationType === "password_reset") {
    return true;
  }

  const supabase = await createServerClient();

  // Check global setting first
  const { data: globalSetting } = await supabase
    .from("notification_settings")
    .select("is_enabled")
    .eq("notification_type", notificationType)
    .single();

  if (!globalSetting?.is_enabled) {
    return false;
  }

  // Check user preference
  const { data: userPref } = await supabase
    .from("user_notification_preferences")
    .select("is_enabled")
    .eq("user_id", userId)
    .eq("notification_type", notificationType)
    .single();

  // If no user preference exists, default to true (user must explicitly opt out)
  return userPref?.is_enabled ?? true;
}

/**
 * Get users who should receive a notification
 */
export async function getUsersForNotification(
  notificationType: NotificationType,
  options?: { excludeUserIds?: string[]; roleFilter?: string[] }
): Promise<{ id: string; email: string; full_name: string }[]> {
  const supabase = await createServerClient();

  // First check if globally enabled and get role filters
  const { data: globalSetting } = await supabase
    .from("notification_settings")
    .select("is_enabled, role_filters")
    .eq("notification_type", notificationType)
    .single();

  if (!globalSetting?.is_enabled) {
    return [];
  }

  // Get all active users
  let usersQuery = supabase
    .from("user_profiles")
    .select("id, email, full_name, role")
    .eq("is_active", true);

  if (options?.excludeUserIds?.length) {
    usersQuery = usersQuery.not("id", "in", `(${options.excludeUserIds.join(",")})`);
  }

  // Combine passed options roleFilter with settings role_filters
  const finalRoleFilter = options?.roleFilter?.length
    ? options.roleFilter
    : globalSetting.role_filters;

  if (finalRoleFilter?.length) {
    usersQuery = usersQuery.in("role", finalRoleFilter);
  }

  const { data: users, error: usersError } = await usersQuery;

  if (usersError || !users) {
    console.error("Error fetching users:", usersError);
    return [];
  }

  // Get users who have opted out
  const { data: optedOut } = await supabase
    .from("user_notification_preferences")
    .select("user_id")
    .eq("notification_type", notificationType)
    .eq("is_enabled", false);

  const optedOutIds = new Set((optedOut || []).map((p) => p.user_id));

  // Filter out opted-out users
  return users.filter((u) => !optedOutIds.has(u.id));
}

// ============================================================
// NOTIFICATION SENDING FUNCTIONS
// ============================================================

/**
 * Create a notification in the database for UI display
 */
export async function createInternalNotification(params: {
  userId: string;
  title: string;
  message: string;
  type: string;
  severity?: "info" | "warning" | "critical";
  resourceType?: string;
  resourceId?: string;
}): Promise<boolean> {
  const supabase = await createServerClient();

  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    title: params.title,
    message: params.message,
    type: params.type,
    severity: params.severity || "info",
    resource_type: params.resourceType,
    resource_id: params.resourceId,
  });

  if (error) {
    console.error("Error creating internal notification:", error);
    return false;
  }

  return true;
}

/**
 * Send expiring items notification (Email + UI)
 */
export async function notifyRightsExpiring(data: RightsExpiringData & { recipientEmail: string; userId: string }) {
  const template = rightsExpiringTemplate(data);

  // 1. Send Email
  const emailRes = await sendEmail({
    to: data.recipientEmail,
    subject: template.subject,
    html: template.html,
    tags: [
      { name: "type", value: "expiring_alert" },
      { name: "urgency", value: data.urgencyLevel },
    ],
  });

  // 2. Create UI Notification
  const message = data.items.map(i =>
    `${i.title}${i.subTitle ? ` (${i.subTitle})` : ''}: Ends ${i.endDate}${i.licenseType ? `, ${i.licenseType}` : ''}`
  ).join("\n");

  await createInternalNotification({
    userId: data.userId,
    title: template.subject,
    message,
    type: "rights_expiring",
    severity: data.urgencyLevel === "milestone_30d" ? "warning" : "critical",
  });

  return emailRes;
}


/**
 * Send movie created notification to all eligible users
 */
export async function notifyMovieCreated(
  data: Omit<MovieCreatedData, "userName">,
  createdByUserId: string
): Promise<void> {
  const users = await getUsersForNotification("movie_created", {
    excludeUserIds: [createdByUserId],
    roleFilter: ["admin", "legal", "editor"],
  });

  if (users.length === 0) return;

  const emails: EmailOptions[] = users.map((user) => {
    const template = movieCreatedTemplate({
      ...data,
      userName: user.full_name || "User",
    });
    return {
      to: user.email,
      subject: template.subject,
      html: template.html,
      tags: [{ name: "type", value: "movie_created" }],
    };
  });

  await sendBatchEmails(emails);
}

/**
 * Send user created notification (with credentials)
 */
export async function notifyUserCreated(data: UserCreatedData): Promise<void> {
  const template = userCreatedTemplate(data);
  await sendEmail({
    to: data.email,
    subject: template.subject,
    html: template.html,
    tags: [{ name: "type", value: "user_created" }],
  });
}

/**
 * Send password reset notification
 */
export async function notifyPasswordReset(
  data: PasswordResetData & { email: string }
): Promise<void> {
  const template = passwordResetTemplate(data);
  await sendEmail({
    to: data.email,
    subject: template.subject,
    html: template.html,
    tags: [{ name: "type", value: "password_reset" }],
  });
}

/**
 * Send daily digest to a user
 */
export async function sendDailyDigest(
  userId: string,
  email: string,
  data: DailyDigestData
): Promise<void> {
  const shouldSend = await shouldSendNotification(userId, "daily_digest");
  if (!shouldSend) return;

  const template = dailyDigestTemplate(data);
  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    tags: [{ name: "type", value: "daily_digest" }],
  });
}

/**
 * Send expiring alerts based on urgency (one month milestone + daily final week)
 * Covers both Assets (Platform Rights) and Movie Agreements (Acquired Movies)
 */
export async function sendExpiringRightsAlerts(
  referenceDate?: Date,
  useRange: boolean = false
): Promise<{
  sent: number;
  errors: number;
}> {
  const supabase = await createServerClient();
  let sent = 0;
  let errors = 0;

  const today = referenceDate || new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Get expiring platform rights
  const { data: expiringRights } = await supabase
    .from("expiring_rights")
    .select("*, start_date, end_date, license_type, category, nature")
    .lte("days_until_expiry", 90)
    .order("days_until_expiry", { ascending: true });

  // 2. Get expiring movie agreements (acquired movies only)
  const { data: expiringMovies } = await supabase
    .from("movies")
    .select("id, title, agreement_start_date, agreement_end_date, source")
    .eq("source", "acquired")
    .not("agreement_end_date", "is", null);

  const processedMovies = (expiringMovies || [])
    .map((m) => {
      const endDate = new Date(m.agreement_end_date!);
      endDate.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.ceil(
        (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: m.id,
        title: m.title,
        endDate: m.agreement_end_date!,
        agreement_start_date: m.agreement_start_date, // Include start date
        days_until_expiry: daysUntilExpiry,
      };
    })
    .filter((m) => m.days_until_expiry >= 0 && m.days_until_expiry <= 90);

  // Group everything into milestone (exactly 90d, 30d) and daily alert (1-7 days)
  const milestone90Items: any[] = [];
  const milestone30Items: any[] = [];
  const dailyAlertItems: any[] = [];

  // Add rights to groups
  (expiringRights || []).forEach((r) => {
    const item = {
      title: r.movie_title,
      subTitle: r.platform_name,
      type: "asset",
      startDate: r.start_date ? new Date(r.start_date).toLocaleDateString() : undefined,
      endDate: new Date(r.end_date).toLocaleDateString(),
      licenseType: r.license_type,
      category: r.category,
      nature: r.nature,
      daysRemaining: r.days_until_expiry,
      id: r.id,
    };

    if (useRange) {
      if (r.days_until_expiry >= 31 && r.days_until_expiry <= 90) {
        milestone90Items.push(item);
      } else if (r.days_until_expiry >= 8 && r.days_until_expiry <= 30) {
        milestone30Items.push(item);
      } else if (r.days_until_expiry <= 7 && r.days_until_expiry >= 0) {
        dailyAlertItems.push(item);
      }
    } else {
      if (r.days_until_expiry === 90) {
        milestone90Items.push(item);
      } else if (r.days_until_expiry === 30) {
        milestone30Items.push(item);
      } else if (r.days_until_expiry <= 7 && r.days_until_expiry >= 0) {
        dailyAlertItems.push(item);
      }
    }
  });

  // Add movies to groups
  processedMovies.forEach((m) => {
    const item = {
      title: m.title,
      subTitle: "Movie Agreement",
      type: "movie_agreement",
      startDate: m.agreement_start_date ? new Date(m.agreement_start_date).toLocaleDateString() : undefined,
      endDate: new Date(m.endDate).toLocaleDateString(),
      daysRemaining: m.days_until_expiry,
      id: m.id,
    };

    if (useRange) {
      if (m.days_until_expiry >= 31 && m.days_until_expiry <= 90) {
        milestone90Items.push(item);
      } else if (m.days_until_expiry >= 8 && m.days_until_expiry <= 30) {
        milestone30Items.push(item);
      } else if (m.days_until_expiry <= 7 && m.days_until_expiry >= 0) {
        dailyAlertItems.push(item);
      }
    } else {
      if (m.days_until_expiry === 90) {
        milestone90Items.push(item);
      } else if (m.days_until_expiry === 30) {
        milestone30Items.push(item);
      } else if (m.days_until_expiry <= 7 && m.days_until_expiry >= 0) {
        dailyAlertItems.push(item);
      }
    }
  });

  // Send 90-Day Milestone Alerts
  if (milestone90Items.length > 0) {
    const users = await getUsersForNotification("rights_expiring_upcoming", { roleFilter: ["admin", "legal", "editor"] });
    for (const user of users) {
      try {
        await notifyRightsExpiring({
          userName: user.full_name || "User",
          recipientEmail: user.email,
          userId: user.id,
          urgencyLevel: "milestone_90d" as any,
          items: milestone90Items,
        });
        sent++;
      } catch {
        errors++;
      }
    }
  }

  // Send 30-Day Milestone Alerts
  if (milestone30Items.length > 0) {
    const users = await getUsersForNotification("rights_expiring_urgent", { roleFilter: ["admin", "legal", "editor"] });
    for (const user of users) {
      try {
        await notifyRightsExpiring({
          userName: user.full_name || "User",
          recipientEmail: user.email,
          userId: user.id,
          urgencyLevel: "milestone_30d" as any,
          items: milestone30Items,
        });
        sent++;
      } catch {
        errors++;
      }
    }
  }

  // Send Daily Final Week Alerts
  if (dailyAlertItems.length > 0) {
    const users = await getUsersForNotification("rights_expiring_critical", { roleFilter: ["admin", "legal", "editor"] });
    for (const user of users) {
      try {
        await notifyRightsExpiring({
          userName: user.full_name || "User",
          recipientEmail: user.email,
          userId: user.id,
          urgencyLevel: "daily_final_week" as any,
          items: dailyAlertItems,
        });
        sent++;
      } catch {
        errors++;
      }
    }
  }

  return { sent, errors };
}

/**
 * Send monthly recensor reminders for all A-certified movies where recensor_flag = true.
 * Called once a month by a cron job. Stops for a movie once admin sets recensor_flag = false.
 */
export async function sendRecensorReminders(): Promise<{ sent: number; errors: number }> {
  const supabase = await createServerClient();
  let sent = 0;
  let errors = 0;

  // Fetch all movies needing recensoring
  const { data: movies, error } = await supabase
    .from("movies")
    .select("id, title, certification, release_year, production_house_name")
    .eq("recensor_flag", true)
    .order("title");

  if (error || !movies || movies.length === 0) return { sent, errors };

  // Get all admin users (recensor reminders go to admins only)
  const users = await getUsersForNotification("recensor_reminder", { roleFilter: ["admin", "legal", "editor"] });
  if (users.length === 0) return { sent, errors };

  // Build a single notification per admin covering all flagged movies
  const movieList = movies
    .map((m: { title: string; certification?: string; release_year?: string }) =>
      `• ${m.title}${m.release_year ? ` (${m.release_year})` : ""}${m.certification ? ` — Cert: ${m.certification}` : ""}`
    )
    .join("\n");

  const title = `Censor Reminder: ${movies.length} movie${movies.length !== 1 ? "s" : ""} pending censoring`;
  const message = `The following A-certified movie${movies.length !== 1 ? "s require" : " requires"} censoring. Visit each movie's edit page and uncheck "Censor Flag" once censoring is done:\n\n${movieList}`;

  for (const user of users) {
    try {
      // Create in-app notification
      await supabase.from("notifications").insert({
        user_id: user.id,
        title,
        message,
        type: "recensor_reminder",
        severity: "warning",
        resource_type: "movie",
      });
      sent++;
    } catch {
      errors++;
    }
  }

  return { sent, errors };
}
