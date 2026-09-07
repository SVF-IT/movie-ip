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
  passwordResetTemplate,
  anniversaryTemplate,
  recensorReminderTemplate,
  pendingApprovalsTemplate,
  type RightsExpiringData,
  type PendingApprovalsData,
  type UserCreatedData,
  type MovieCreatedData,
  type PasswordResetData,
  type AnniversaryEmailData,
} from "./templates";

// Notification types that can be configured
export type NotificationType =
  | "rights_expiring_digest"    // Every 2 weeks, all rights expiring within 90 days
  | "agreement_end_reminder"    // Every 2 weeks, acquired-movie agreements ending within 90 days
  | "movie_created"
  | "recensor_reminder"         // Every 2 weeks, for A-certified movies with recensor_flag=true
  | "pending_approvals_reminder" // Every 2 days, all pending movie_pending_changes rows
  | "user_created"              // Admin only
  | "password_reset"            // Always sent, cannot be disabled
  | "anniversary_notification"; // Every 10 days, upcoming anniversaries within 28 days

// Global notification settings (admin configurable)
export interface GlobalNotificationSettings {
  id: string;
  notification_type: NotificationType;
  is_enabled: boolean;
  description: string;
  category: "alerts" | "activity" | "digest" | "account" | "special_events";
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

// Admin-managed external (non-app-user) notification contact
export interface ExternalNotificationRecipient {
  id: string;
  name: string;
  email: string;
  tag: string | null;
  notification_types: NotificationType[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
 * List all external (non-app-user) notification contacts (admin only).
 */
export async function getExternalRecipients(): Promise<ExternalNotificationRecipient[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("notification_external_recipients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching external recipients:", error);
    return [];
  }

  return data || [];
}

/**
 * Create a new external notification contact (admin only).
 */
export async function createExternalRecipient(input: {
  name: string;
  email: string;
  tag?: string | null;
  notification_types: NotificationType[];
}): Promise<ExternalNotificationRecipient | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("notification_external_recipients")
    .insert({
      name: input.name,
      email: input.email,
      tag: input.tag ?? null,
      notification_types: input.notification_types,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating external recipient:", error);
    return null;
  }

  return data;
}

/**
 * Update an external notification contact (admin only).
 */
export async function updateExternalRecipient(
  id: string,
  updates: {
    name?: string;
    email?: string;
    tag?: string | null;
    notification_types?: NotificationType[];
    is_active?: boolean;
  }
): Promise<boolean> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("notification_external_recipients")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Error updating external recipient:", error);
    return false;
  }

  return true;
}

/**
 * Delete an external notification contact (admin only).
 */
export async function deleteExternalRecipient(id: string): Promise<boolean> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("notification_external_recipients")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting external recipient:", error);
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

/**
 * Get external (non-app-user) contacts subscribed to a given notification
 * type. These are admin-managed and receive email only — they have no
 * auth.users row, so they can never receive an in-app notification.
 */
async function getExternalRecipientsForNotification(
  notificationType: NotificationType
): Promise<{ name: string; email: string }[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("notification_external_recipients")
    .select("name, email")
    .eq("is_active", true)
    .contains("notification_types", [notificationType]);

  if (error) {
    console.error("Error fetching external recipients:", error);
    return [];
  }

  return data ?? [];
}

/**
 * Combined recipient resolution: internal app users (via
 * getUsersForNotification) plus external contacts. Use this instead of
 * getUsersForNotification directly when a notification type should also
 * be able to reach people without a login.
 */
export async function getRecipientsForNotification(
  notificationType: NotificationType,
  options?: { excludeUserIds?: string[]; roleFilter?: string[] }
): Promise<{
  internal: { id: string; email: string; full_name: string }[];
  external: { name: string; email: string }[];
}> {
  const [internal, external] = await Promise.all([
    getUsersForNotification(notificationType, options),
    getExternalRecipientsForNotification(notificationType),
  ]);
  return { internal, external };
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
    type: data.urgencyLevel === "agreement_end_digest" ? "agreement_end_reminder" : "rights_expiring_digest",
    severity: "warning",
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
  const { internal: users, external } = await getRecipientsForNotification("movie_created", {
    excludeUserIds: [createdByUserId],
  });

  const emails: EmailOptions[] = [];
  for (const user of users) {
    const template = movieCreatedTemplate({ ...data, userName: user.full_name || "User" });
    emails.push({
      to: user.email,
      subject: template.subject,
      html: template.html,
      tags: [{ name: "type", value: "movie_created" }],
    });
    await createInternalNotification({
      userId: user.id,
      title: `New movie added: ${data.movieTitle}`,
      message: `${data.movieTitle} (${data.source === "home_production" ? "Home Production" : "Acquired"}${data.releaseYear ? `, ${data.releaseYear}` : ""}) was added by ${data.createdBy}.`,
      type: "movie_created",
      severity: "info",
      resourceType: "movie",
      resourceId: data.movieId,
    });
  }

  for (const contact of external) {
    const template = movieCreatedTemplate({ ...data, userName: contact.name || "there" }, { isExternal: true });
    emails.push({
      to: contact.email,
      subject: template.subject,
      html: template.html,
      tags: [{ name: "type", value: "movie_created" }],
    });
  }

  if (emails.length > 0) await sendBatchEmails(emails);
}

/**
 * Send user created notification (with credentials)
 */
export async function notifyUserCreated(data: UserCreatedData & { userId: string }): Promise<void> {
  const template = userCreatedTemplate(data);
  await Promise.all([
    sendEmail({
      to: data.email,
      subject: template.subject,
      html: template.html,
      tags: [{ name: "type", value: "user_created" }],
    }),
    createInternalNotification({
      userId: data.userId,
      title: `Welcome to Film IP Manager, ${data.userName}!`,
      message: `Your account has been created by ${data.createdBy}. Please log in and change your temporary password.`,
      type: "user_created",
      severity: "info",
    }),
  ]);
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
 * Send a single expiring-rights digest covering all platform (asset) rights
 * expiring within the next 90 days. Runs on a 2-week cron cadence (see
 * /api/notifications/send-alerts); the 90-day lookahead window intentionally
 * overlaps between runs. Movie agreement end dates are handled separately by
 * sendAgreementEndReminders, not included here.
 */
export async function sendExpiringRightsAlerts(
  referenceDate?: Date
): Promise<{
  sent: number;
  errors: number;
}> {
  let sent = 0;
  let errors = 0;

  const supabase = await createServerClient();
  const today = referenceDate || new Date();
  today.setHours(0, 0, 0, 0);

  const { data: expiringRights } = await supabase
    .from("expiring_rights")
    .select("*, start_date, end_date, license_type, category, nature")
    .lte("days_until_expiry", 90)
    .gte("days_until_expiry", 0)
    .order("days_until_expiry", { ascending: true });

  const items: RightsExpiringData["items"] = (expiringRights || []).map((r) => ({
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
  }));

  if (items.length === 0) return { sent, errors };

  const { internal: users, external } = await getRecipientsForNotification("rights_expiring_digest");

  for (const user of users) {
    try {
      await notifyRightsExpiring({
        userName: user.full_name || "User",
        recipientEmail: user.email,
        userId: user.id,
        urgencyLevel: "digest",
        items,
      });
      sent++;
    } catch {
      errors++;
    }
  }

  for (const contact of external) {
    try {
      const template = rightsExpiringTemplate(
        { userName: contact.name || "there", urgencyLevel: "digest", items },
        { isExternal: true }
      );
      await sendEmail({
        to: contact.email,
        subject: template.subject,
        html: template.html,
        tags: [{ name: "type", value: "rights_expiring_digest" }],
      });
      sent++;
    } catch {
      errors++;
    }
  }

  return { sent, errors };
}

/**
 * Send a single agreement-end-date digest covering acquired-movie agreements
 * ending within the next 90 days. Runs on a 2-week cron cadence (see
 * /api/notifications/agreement-end-reminders); the 90-day lookahead window
 * intentionally overlaps between runs.
 */
export async function sendAgreementEndReminders(
  referenceDate?: Date
): Promise<{
  sent: number;
  errors: number;
}> {
  let sent = 0;
  let errors = 0;

  const supabase = await createServerClient();
  const today = referenceDate || new Date();
  today.setHours(0, 0, 0, 0);

  const { data: expiringMovies } = await supabase
    .from("movies")
    .select("id, title, agreement_start_date, agreement_end_date, source")
    .eq("source", "acquired")
    .not("agreement_end_date", "is", null);

  const items: RightsExpiringData["items"] = (expiringMovies || [])
    .map((m) => {
      const endDate = new Date(m.agreement_end_date!);
      endDate.setHours(0, 0, 0, 0);
      const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        title: m.title,
        subTitle: "Movie Agreement",
        type: "movie_agreement" as const,
        startDate: m.agreement_start_date ? new Date(m.agreement_start_date).toLocaleDateString() : undefined,
        endDate: endDate.toLocaleDateString(),
        daysRemaining,
        id: m.id,
      };
    })
    .filter((m) => m.daysRemaining >= 0 && m.daysRemaining <= 90);

  if (items.length === 0) return { sent, errors };

  const { internal: users, external } = await getRecipientsForNotification("agreement_end_reminder");

  for (const user of users) {
    try {
      await notifyRightsExpiring({
        userName: user.full_name || "User",
        recipientEmail: user.email,
        userId: user.id,
        urgencyLevel: "agreement_end_digest",
        items,
      });
      sent++;
    } catch {
      errors++;
    }
  }

  for (const contact of external) {
    try {
      const template = rightsExpiringTemplate(
        { userName: contact.name || "there", urgencyLevel: "agreement_end_digest", items },
        { isExternal: true }
      );
      await sendEmail({
        to: contact.email,
        subject: template.subject,
        html: template.html,
        tags: [{ name: "type", value: "agreement_end_reminder" }],
      });
      sent++;
    } catch {
      errors++;
    }
  }

  return { sent, errors };
}

const ANNIVERSARY_MILESTONES = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75];

/**
 * Send anniversary email notifications for every movie with an anniversary
 * (any year, not just milestones) within the next 28 days. Milestone years
 * (1,5,10,15,20,25,30,35,40,45,50,60,75) are marked as such so they can be
 * highlighted in the template/banner; other years still show, unmarked.
 * Runs on a 10-day cron cadence (see /api/notifications/anniversary-reminders); the 28-day
 * lookahead window intentionally overlaps between runs so nothing near a boundary is missed.
 */
export async function sendAnniversaryNotifications(): Promise<{ sent: number; errors: number }> {
  const supabase = await createServerClient();
  let sent = 0;
  let errors = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch all movies with a release_date
  const { data: movies, error } = await supabase
    .from("movies")
    .select("id, title, release_date, language")
    .not("release_date", "is", null);

  if (error || !movies || movies.length === 0) {
    console.log("[anniversary] no movies with release_date", { error: error?.message, count: movies?.length ?? 0 });
    return { sent, errors };
  }

  const upcoming: AnniversaryEmailData["anniversaries"] = [];

  for (const movie of movies) {
    const releaseDate = new Date(movie.release_date);
    const releaseYear = releaseDate.getFullYear();
    const currentYear = today.getFullYear();

    // Check every anniversary year from this year through next year (covers
    // window boundaries around New Year's) rather than only milestone years.
    for (const anniversaryYear of [currentYear, currentYear + 1]) {
      const yearsSinceRelease = anniversaryYear - releaseYear;
      if (yearsSinceRelease <= 0) continue;

      const anniversaryDate = new Date(releaseDate);
      anniversaryDate.setFullYear(anniversaryYear);
      anniversaryDate.setHours(0, 0, 0, 0);

      const daysUntil = Math.ceil((anniversaryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil >= 0 && daysUntil <= 28) {
        upcoming.push({
          title: movie.title,
          milestone: yearsSinceRelease,
          isMilestone: ANNIVERSARY_MILESTONES.includes(yearsSinceRelease),
          releaseYear,
          anniversaryDate: anniversaryDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
          daysUntil,
          movieId: movie.id,
          language: movie.language,
        });
      }
    }
  }

  if (upcoming.length === 0) {
    console.log("[anniversary] no anniversaries within 28 days", { moviesChecked: movies.length });
    return { sent, errors };
  }

  upcoming.sort((a: AnniversaryEmailData["anniversaries"][number], b: AnniversaryEmailData["anniversaries"][number]) => a.daysUntil - b.daysUntil);

  const todayItems = upcoming.filter(a => a.daysUntil === 0);
  const inAppTitle = todayItems.length > 0
    ? `🎉 ${todayItems.map(a => a.title).join(", ")} celebrating today!`
    : `🎬 ${upcoming.length} upcoming movie anniversar${upcoming.length === 1 ? "y" : "ies"} in the next 4 weeks`;
  const inAppMessage = upcoming
    .slice(0, 5)
    .map(a => `${a.title} — ${a.milestone}yr anniversary${a.daysUntil === 0 ? " (today!)" : ` in ${a.daysUntil} days`}`)
    .join("\n") + (upcoming.length > 5 ? `\n…and ${upcoming.length - 5} more` : "");

  const { internal: users, external } = await getRecipientsForNotification("anniversary_notification");
  console.log("[anniversary] resolved recipients", {
    upcoming: upcoming.length,
    internal: users.length,
    external: external.length,
    hasResendKey: !!process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM ?? "(default)",
  });
  for (const user of users) {
    try {
      const template = anniversaryTemplate({ userName: user.full_name || "User", anniversaries: upcoming });
      const [emailRes] = await Promise.all([
        sendEmail({
          to: user.email,
          subject: template.subject,
          html: template.html,
          tags: [{ name: "type", value: "anniversary_notification" }],
        }),
        createInternalNotification({
          userId: user.id,
          title: inAppTitle,
          message: inAppMessage,
          type: "anniversary_notification",
          severity: todayItems.length > 0 ? "warning" : "info",
        }),
      ]);
      if (!emailRes.success) {
        console.error("[anniversary] Resend rejected email for", user.email, emailRes.error);
      }
      sent++;
    } catch (e) {
      console.error("[anniversary] failed sending to internal user", user.email, e);
      errors++;
    }
  }

  if (external.length > 0) {
    try {
      const emails: EmailOptions[] = external.map((contact) => {
        const template = anniversaryTemplate(
          { userName: contact.name || "there", anniversaries: upcoming },
          { isExternal: true }
        );
        return {
          to: contact.email,
          subject: template.subject,
          html: template.html,
          tags: [{ name: "type", value: "anniversary_notification" }],
        };
      });
      await sendBatchEmails(emails);
      sent += external.length;
    } catch (e) {
      console.error("[anniversary] failed sending to external recipients", e);
      errors += external.length;
    }
  }

  return { sent, errors };
}

/**
 * Send monthly recensor reminders for all A-certified movies where recensor_flag = true.
 * Runs on a 2-week cron cadence (see /api/notifications/recensor-reminders).
 * Stops listing a movie once admin sets recensor_flag = false.
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

  const { internal: users, external } = await getRecipientsForNotification("recensor_reminder");
  if (users.length === 0 && external.length === 0) return { sent, errors };

  const templateMovies = movies.map((m) => ({
    id: m.id,
    title: m.title,
    certification: m.certification,
    releaseYear: m.release_year,
    productionHouseName: m.production_house_name,
  }));

  const title = `Censor Reminder: ${movies.length} movie${movies.length !== 1 ? "s" : ""} pending censoring`;
  const message = movies
    .map((m: { title: string; certification?: string; release_year?: string }) =>
      `• ${m.title}${m.release_year ? ` (${m.release_year})` : ""}${m.certification ? ` — Cert: ${m.certification}` : ""}`
    )
    .join("\n");

  for (const user of users) {
    try {
      const template = recensorReminderTemplate({ userName: user.full_name || "User", movies: templateMovies });
      await Promise.all([
        sendEmail({
          to: user.email,
          subject: template.subject,
          html: template.html,
          tags: [{ name: "type", value: "recensor_reminder" }],
        }),
        createInternalNotification({
          userId: user.id,
          title,
          message,
          type: "recensor_reminder",
          severity: "warning",
          resourceType: "movie",
        }),
      ]);
      sent++;
    } catch {
      errors++;
    }
  }

  for (const contact of external) {
    try {
      const template = recensorReminderTemplate(
        { userName: contact.name || "there", movies: templateMovies },
        { isExternal: true }
      );
      await sendEmail({
        to: contact.email,
        subject: template.subject,
        html: template.html,
        tags: [{ name: "type", value: "recensor_reminder" }],
      });
      sent++;
    } catch {
      errors++;
    }
  }

  return { sent, errors };
}

/**
 * Send a pending-approvals reminder covering every movie_pending_changes row
 * still in "pending" status. Runs on a 2-day cron cadence (see
 * /api/notifications/pending-approvals-reminders).
 */
export async function sendPendingApprovalsReminders(): Promise<{ sent: number; errors: number }> {
  const supabase = await createServerClient();
  let sent = 0;
  let errors = 0;

  const { data: changes, error } = await supabase
    .from("movie_pending_changes")
    .select("id, movie_id, change_type, change_summary, changed_by_name, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error || !changes || changes.length === 0) return { sent, errors };

  const movieIds = [...new Set(changes.map((c) => c.movie_id))];
  const { data: movies } = await supabase.from("movies").select("id, title").in("id", movieIds);
  const movieTitleById = new Map((movies || []).map((m) => [m.id, m.title]));

  const templateChanges: PendingApprovalsData["changes"] = changes.map((c) => ({
    id: c.id,
    movieTitle: movieTitleById.get(c.movie_id) || "Unknown Movie",
    changeType: c.change_type,
    changeSummary: c.change_summary,
    changedByName: c.changed_by_name ?? undefined,
    createdAt: c.created_at,
  }));

  const { internal: users, external } = await getRecipientsForNotification("pending_approvals_reminder");
  if (users.length === 0 && external.length === 0) return { sent, errors };

  const title = `${changes.length} pending approval${changes.length !== 1 ? "s" : ""} awaiting review`;
  const message = templateChanges
    .map((c) => `• ${c.movieTitle}: ${c.changeSummary}`)
    .join("\n");

  for (const user of users) {
    try {
      const template = pendingApprovalsTemplate({ userName: user.full_name || "User", changes: templateChanges });
      await Promise.all([
        sendEmail({
          to: user.email,
          subject: template.subject,
          html: template.html,
          tags: [{ name: "type", value: "pending_approvals_reminder" }],
        }),
        createInternalNotification({
          userId: user.id,
          title,
          message,
          type: "pending_approvals_reminder",
          severity: "warning",
        }),
      ]);
      sent++;
    } catch {
      errors++;
    }
  }

  for (const contact of external) {
    try {
      const template = pendingApprovalsTemplate(
        { userName: contact.name || "there", changes: templateChanges },
        { isExternal: true }
      );
      await sendEmail({
        to: contact.email,
        subject: template.subject,
        html: template.html,
        tags: [{ name: "type", value: "pending_approvals_reminder" }],
      });
      sent++;
    } catch {
      errors++;
    }
  }

  return { sent, errors };
}
