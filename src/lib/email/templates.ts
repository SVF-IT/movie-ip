/**
 * Email Templates for Film IP Manager
 * All templates use inline CSS for maximum email client compatibility
 */

const APP_NAME = "Film IP Manager";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://filmip.app";

// Brand colors
const COLORS = {
  primary: "#2563eb",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  text: "#1f2937",
  textMuted: "#6b7280",
  background: "#f9fafb",
  white: "#ffffff",
  border: "#e5e7eb",
};

/**
 * Base email layout wrapper
 */
function baseTemplate(content: string, preheader?: string, options?: { isExternal?: boolean }): string {
  const footerNote = options?.isExternal
    ? `<p style="margin: 0; font-size: 12px; color: ${COLORS.textMuted}; text-align: center;">
                You're receiving this because you're on SVF's external notification list. Contact your SVF administrator to update or remove your subscription.
              </p>`
    : `<p style="margin: 0; font-size: 12px; color: ${COLORS.textMuted}; text-align: center;">
                <a href="${APP_URL}/settings/notifications" style="color: ${COLORS.primary}; text-decoration: none;">Manage notification preferences</a>
              </p>`;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${COLORS.background};">
  ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${preheader}</div>` : ""}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${COLORS.background};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: ${COLORS.white}; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; border-bottom: 1px solid ${COLORS.border};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: ${COLORS.primary};">${APP_NAME}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid ${COLORS.border}; background-color: ${COLORS.background}; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px; font-size: 12px; color: ${COLORS.textMuted}; text-align: center;">
                This is an automated notification from ${APP_NAME}.
              </p>
              ${footerNote}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Alert badge component
 */
function alertBadge(
  type: "info" | "success" | "warning" | "danger",
  text: string
): string {
  const colors = {
    info: { bg: "#dbeafe", text: "#1e40af" },
    success: { bg: "#d1fae5", text: "#065f46" },
    warning: { bg: "#fef3c7", text: "#92400e" },
    danger: { bg: "#fee2e2", text: "#991b1b" },
  };
  const c = colors[type];
  return `<span style="display: inline-block; padding: 4px 12px; background-color: ${c.bg}; color: ${c.text}; font-size: 12px; font-weight: 600; border-radius: 9999px; text-transform: uppercase;">${text}</span>`;
}

/**
 * Button component
 */
function button(text: string, href: string, variant: "primary" | "secondary" = "primary"): string {
  const styles = {
    primary: `background-color: ${COLORS.primary}; color: ${COLORS.white};`,
    secondary: `background-color: ${COLORS.white}; color: ${COLORS.primary}; border: 2px solid ${COLORS.primary};`,
  };
  return `<a href="${href}" style="display: inline-block; padding: 12px 24px; ${styles[variant]} font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px;">${text}</a>`;
}

// ============================================================
// NOTIFICATION TEMPLATES
// ============================================================

export interface RightsExpiringData {
  userName: string;
  items: {
    title: string;
    subTitle: string; // Platform name or "Movie Agreement"
    type: "asset" | "movie_agreement";
    startDate?: string;
    endDate: string;
    licenseType?: string;
    category?: string;
    nature?: string;
    daysRemaining: number;
    id: string; // rightId or movieId
  }[];
  urgencyLevel: "digest" | "agreement_end_digest" | "milestone_90d" | "milestone_30d" | "daily_final_week" | "upcoming" | "urgent" | "critical";
}

export function rightsExpiringTemplate(data: RightsExpiringData, options?: { isExternal?: boolean }): { subject: string; html: string } {
  const urgencyConfig = {
    critical: { badge: "danger", label: "Critical", subject: "CRITICAL: Expiring Within 7 Days" },
    urgent: { badge: "warning", label: "Urgent", subject: "Urgent: Expiring Within 30 Days" },
    upcoming: { badge: "info", label: "Upcoming", subject: "Reminder: Expiring Soon" },
    milestone_90d: { badge: "info", label: "90-Day Warning", subject: "Reminder: Agreement/Rights Expiring in 90 Days" },
    milestone_30d: { badge: "warning", label: "30-Day Warning", subject: "Reminder: Agreement/Rights Expiring in 30 Days" },
    daily_final_week: { badge: "danger", label: "Final Week Daily Alert", subject: "URGENT: Agreement/Rights Expiring This Week" },
    digest: { badge: "warning", label: "Expiring Rights", subject: "Rights Expiring Within 90 Days" },
    agreement_end_digest: { badge: "warning", label: "Agreement End Date", subject: "Acquired Movie Agreements Ending Within 90 Days" },
  };
  const config = urgencyConfig[data.urgencyLevel];

  const itemRows = data.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border};">
        <strong style="color: ${COLORS.text};">${item.title}</strong><br>
        <span style="font-size: 13px; color: ${COLORS.textMuted};">
          ${item.subTitle} 
          ${item.licenseType ? `<br><small>${item.licenseType} | ${item.nature || ""}</small>` : ""}
        </span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border}; text-align: center; font-size: 13px;">
        ${item.startDate ? `${item.startDate} to<br>` : ""}
        <strong>${item.endDate}</strong>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border}; text-align: center;">
        ${alertBadge(item.daysRemaining <= 7 ? "danger" : item.daysRemaining <= 30 ? "warning" : "info", `${item.daysRemaining}d`)}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border}; text-align: right;">
        <a href="${APP_URL}/${item.type === 'asset' ? 'rights' : `movies/${item.id}`}" style="color: ${COLORS.primary}; text-decoration: none; font-size: 13px;">View</a>
      </td>
    </tr>
  `
    )
    .join("");

  const content = `
    <div style="margin-bottom: 24px;">
      ${alertBadge(config.badge as "info" | "success" | "warning" | "danger", config.label)}
    </div>
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: ${COLORS.text};">
      Hi ${data.userName},
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
      The following ${data.items.length} item${data.items.length > 1 ? "s" : ""} ${data.items.length > 1 ? "are" : "is"} approaching expiration:
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden;">
      <tr style="background-color: ${COLORS.background};">
        <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Title / Details</th>
        <th style="padding: 12px; text-align: center; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Period</th>
        <th style="padding: 12px; text-align: center; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Days Left</th>
        <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Action</th>
      </tr>
      ${itemRows}
    </table>
    <div style="margin-top: 32px; text-align: center;">
      ${button("View All Expiring Items", `${APP_URL}/expiring`)}
    </div>
  `;

  return {
    subject: config.subject,
    html: baseTemplate(content, `${data.items.length} items expiring - action required`, options),
  };
}

export interface AnniversaryEmailData {
  userName: string;
  anniversaries: {
    title: string;
    milestone: number;
    isMilestone: boolean;
    releaseYear: number;
    anniversaryDate: string;
    daysUntil: number;
    movieId: string;
    language?: string;
  }[];
}

export function anniversaryTemplate(data: AnniversaryEmailData, options?: { isExternal?: boolean }): { subject: string; html: string } {
  const todayItems = data.anniversaries.filter(a => a.daysUntil === 0);
  const upcomingItems = data.anniversaries.filter(a => a.daysUntil > 0);

  const milestoneLabel = (n: number) =>
    n === 1 ? "1st Anniversary" :
    n === 2 ? "2nd Anniversary" :
    n === 3 ? "3rd Anniversary" :
    `${n}th Anniversary`;

  const ordinalSuffix = (n: number) =>
    n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";

  const renderRow = (a: AnniversaryEmailData["anniversaries"][number]) => {
    const badge = a.daysUntil === 0
      ? alertBadge("success", "Today!")
      : a.daysUntil <= 7
      ? alertBadge("danger", `${a.daysUntil}d`)
      : alertBadge("info", `${a.daysUntil}d`);

    return `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border};">
        <strong style="color: ${COLORS.text};">${a.title}</strong>
        ${a.isMilestone ? ` ${alertBadge("warning", "Milestone")}` : ""}<br>
        <span style="font-size: 13px; color: ${COLORS.textMuted};">
          ${a.releaseYear} · ${a.milestone}${ordinalSuffix(a.milestone)} Anniversary
          ${a.language ? ` · ${a.language}` : ""}
        </span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border}; text-align: center; font-size: 13px; color: ${COLORS.textMuted};">
        ${a.anniversaryDate}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border}; text-align: center;">
        ${badge}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border}; text-align: right;">
        <a href="${APP_URL}/movies/${a.movieId}" style="color: ${COLORS.primary}; text-decoration: none; font-size: 13px;">View</a>
      </td>
    </tr>`;
  };

  const todaySection = todayItems.length > 0 ? `
    <div style="background-color: #d1fae5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 14px; color: #065f46; font-weight: 600;">
        🎉 ${todayItems.length} movie anniversary happening today!
      </p>
      <p style="margin: 8px 0 0; font-size: 13px; color: #047857;">
        ${todayItems.map(a => `${a.title} — ${a.milestone}${ordinalSuffix(a.milestone)} Anniversary`).join(", ")}
      </p>
    </div>
  ` : "";

  const content = `
    <div style="margin-bottom: 24px;">
      ${alertBadge("info", "Special Events")}
    </div>
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: ${COLORS.text};">
      Hi ${data.userName},
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
      Here are the upcoming movie anniversaries in the next 4 weeks:
    </p>
    ${todaySection}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden;">
      <tr style="background-color: ${COLORS.background};">
        <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Movie</th>
        <th style="padding: 12px; text-align: center; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Date</th>
        <th style="padding: 12px; text-align: center; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Days Away</th>
        <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Action</th>
      </tr>
      ${data.anniversaries.map(renderRow).join("")}
    </table>
    <div style="margin-top: 32px; text-align: center;">
      ${button("View Movies", `${APP_URL}/movies`)}
    </div>
  `;

  const subjectParts: string[] = [];
  if (todayItems.length > 0) subjectParts.push(`${todayItems.length} today`);
  if (upcomingItems.length > 0) subjectParts.push(`${upcomingItems.length} upcoming`);

  return {
    subject: `🎬 Movie Anniversaries: ${subjectParts.join(", ")}`,
    html: baseTemplate(content, `${data.anniversaries.length} upcoming movie anniversaries`, options),
  };
}

export interface UserCreatedData {
  userName: string;
  email: string;
  employeeId: string;
  role: string;
  temporaryPassword: string;
  createdBy: string;
}

export function userCreatedTemplate(data: UserCreatedData, options?: { isExternal?: boolean }): { subject: string; html: string } {
  const content = `
    <div style="margin-bottom: 24px;">
      ${alertBadge("success", "Welcome")}
    </div>
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: ${COLORS.text};">
      Welcome to ${APP_NAME}, ${data.userName}!
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
      Your account has been created. Here are your login credentials:
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; width: 140px; font-weight: 600; color: ${COLORS.textMuted};">Email</td>
        <td style="padding: 16px; color: ${COLORS.text};">${data.email}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Employee ID</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; font-family: monospace;">${data.employeeId}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Role</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.text}; text-transform: capitalize;">${data.role}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Temporary Password</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border};">
          <code style="background-color: ${COLORS.background}; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 14px;">${data.temporaryPassword}</code>
        </td>
      </tr>
    </table>
    <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 14px; color: #92400e;">
        <strong>Important:</strong> You will be required to change your password on first login.
      </p>
    </div>
    <div style="text-align: center;">
      ${button("Login Now", `${APP_URL}/login`)}
    </div>
  `;

  return {
    subject: `Welcome to ${APP_NAME} - Your Account is Ready`,
    html: baseTemplate(content, `Your ${APP_NAME} account has been created`, options),
  };
}

export interface MovieCreatedData {
  userName: string;
  movieTitle: string;
  movieCode: string;
  source: string;
  releaseYear?: number;
  language?: string;
  movieId: string;
  createdBy: string;
}

export function movieCreatedTemplate(data: MovieCreatedData, options?: { isExternal?: boolean }): { subject: string; html: string } {
  const content = `
    <div style="margin-bottom: 24px;">
      ${alertBadge("success", "New Movie")}
    </div>
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: ${COLORS.text};">
      Hi ${data.userName},
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
      A new movie has been added to the catalog:
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; width: 140px; font-weight: 600; color: ${COLORS.textMuted};">Title</td>
        <td style="padding: 16px; color: ${COLORS.text}; font-weight: 600;">${data.movieTitle}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Code</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; font-family: monospace;">${data.movieCode}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Source</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.text};">${data.source === "home_production" ? "Home Production" : "Acquired"}</td>
      </tr>
      ${data.releaseYear ? `
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Release Year</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.text};">${data.releaseYear}</td>
      </tr>
      ` : ""}
      ${data.language ? `
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Language</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.text};">${data.language}</td>
      </tr>
      ` : ""}
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Added By</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.text};">${data.createdBy}</td>
      </tr>
    </table>
    <div style="text-align: center;">
      ${button("View Movie", `${APP_URL}/movies/${data.movieId}`)}
    </div>
  `;

  return {
    subject: `New Movie Added: ${data.movieTitle}`,
    html: baseTemplate(content, `New movie added to catalog: ${data.movieTitle}`, options),
  };
}

export interface PasswordResetData {
  userName: string;
  newPassword: string;
  resetBy: string;
}

export function passwordResetTemplate(data: PasswordResetData): { subject: string; html: string } {
  const content = `
    <div style="margin-bottom: 24px;">
      ${alertBadge("warning", "Password Reset")}
    </div>
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: ${COLORS.text};">
      Hi ${data.userName},
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
      Your password has been reset by an administrator. Here is your new temporary password:
    </p>
    <div style="background-color: ${COLORS.background}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <code style="font-size: 18px; font-family: monospace; letter-spacing: 2px;">${data.newPassword}</code>
    </div>
    <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 14px; color: #92400e;">
        <strong>Important:</strong> You will be required to change this password on your next login.
      </p>
    </div>
    <p style="margin: 0 0 24px; font-size: 13px; color: ${COLORS.textMuted};">
      Reset by: ${data.resetBy}
    </p>
    <div style="text-align: center;">
      ${button("Login Now", `${APP_URL}/login`)}
    </div>
  `;

  return {
    subject: `Your ${APP_NAME} Password Has Been Reset`,
    html: baseTemplate(content, "Your password has been reset"),
  };
}

export interface RecensorReminderData {
  userName: string;
  movies: {
    id: string;
    title: string;
    certification?: string;
    releaseYear?: string;
    productionHouseName?: string;
  }[];
}

export function recensorReminderTemplate(data: RecensorReminderData, options?: { isExternal?: boolean }): { subject: string; html: string } {
  const movieRows = data.movies
    .map(
      (m) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border};">
        <strong style="color: ${COLORS.text};">${m.title}</strong><br>
        <span style="font-size: 13px; color: ${COLORS.textMuted};">
          ${m.releaseYear ? `${m.releaseYear} · ` : ""}${m.certification ? `Cert: ${m.certification}` : ""}
          ${m.productionHouseName ? ` · ${m.productionHouseName}` : ""}
        </span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border}; text-align: right;">
        <a href="${APP_URL}/movies/${m.id}" style="color: ${COLORS.primary}; text-decoration: none; font-size: 13px;">View</a>
      </td>
    </tr>
  `
    )
    .join("");

  const content = `
    <div style="margin-bottom: 24px;">
      ${alertBadge("warning", "Censor Reminder")}
    </div>
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: ${COLORS.text};">
      Hi ${data.userName},
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
      The following ${data.movies.length} A-certified movie${data.movies.length > 1 ? "s require" : " requires"} re-censoring.
      Visit each movie's edit page and uncheck "Censor Flag" once censoring is done.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden;">
      <tr style="background-color: ${COLORS.background};">
        <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Movie</th>
        <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Action</th>
      </tr>
      ${movieRows}
    </table>
  `;

  return {
    subject: `Censor Reminder: ${data.movies.length} movie${data.movies.length !== 1 ? "s" : ""} pending censoring`,
    html: baseTemplate(content, `${data.movies.length} A-certified movies pending re-censoring`, options),
  };
}

export interface PendingApprovalsData {
  userName: string;
  changes: {
    id: string;
    movieTitle: string;
    changeType: string;
    changeSummary: string;
    changedByName?: string;
    createdAt: string;
  }[];
}

export function pendingApprovalsTemplate(data: PendingApprovalsData, options?: { isExternal?: boolean }): { subject: string; html: string } {
  const changeTypeLabel: Record<string, string> = {
    movie_fields: "Movie Details",
    right_create: "New Right",
    right_update: "Right Update",
    right_delete: "Right Deletion",
    person_add: "Person Added",
    person_remove: "Person Removed",
  };

  const rows = data.changes
    .map(
      (c) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border};">
        <strong style="color: ${COLORS.text};">${c.movieTitle}</strong><br>
        <span style="font-size: 13px; color: ${COLORS.textMuted};">
          ${changeTypeLabel[c.changeType] || c.changeType} — ${c.changeSummary}
          ${c.changedByName ? ` · Submitted by ${c.changedByName}` : ""}
        </span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border}; text-align: right;">
        <a href="${APP_URL}/legal-approvals" style="color: ${COLORS.primary}; text-decoration: none; font-size: 13px;">Review</a>
      </td>
    </tr>
  `
    )
    .join("");

  const content = `
    <div style="margin-bottom: 24px;">
      ${alertBadge("warning", "Pending Approvals")}
    </div>
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: ${COLORS.text};">
      Hi ${data.userName},
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
      There ${data.changes.length > 1 ? "are" : "is"} ${data.changes.length} change${data.changes.length > 1 ? "s" : ""} awaiting your review.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden;">
      <tr style="background-color: ${COLORS.background};">
        <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Change</th>
        <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 600; color: ${COLORS.textMuted}; text-transform: uppercase;">Action</th>
      </tr>
      ${rows}
    </table>
    <div style="margin-top: 32px; text-align: center;">
      ${button("Review All Pending Changes", `${APP_URL}/legal-approvals`)}
    </div>
  `;

  return {
    subject: `${data.changes.length} pending approval${data.changes.length !== 1 ? "s" : ""} awaiting review`,
    html: baseTemplate(content, `${data.changes.length} changes awaiting review`, options),
  };
}
