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
function baseTemplate(content: string, preheader?: string): string {
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
              <p style="margin: 0; font-size: 12px; color: ${COLORS.textMuted}; text-align: center;">
                <a href="${APP_URL}/settings/notifications" style="color: ${COLORS.primary}; text-decoration: none;">Manage notification preferences</a>
              </p>
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
  urgencyLevel: "milestone_90d" | "milestone_30d" | "daily_final_week" | "upcoming" | "urgent" | "critical";
}

export function rightsExpiringTemplate(data: RightsExpiringData): { subject: string; html: string } {
  const urgencyConfig = {
    critical: { badge: "danger", label: "Critical", subject: "CRITICAL: Expiring Within 7 Days" },
    urgent: { badge: "warning", label: "Urgent", subject: "Urgent: Expiring Within 30 Days" },
    upcoming: { badge: "info", label: "Upcoming", subject: "Reminder: Expiring Soon" },
    milestone_90d: { badge: "info", label: "90-Day Warning", subject: "Reminder: Agreement/Rights Expiring in 90 Days" },
    milestone_30d: { badge: "warning", label: "30-Day Warning", subject: "Reminder: Agreement/Rights Expiring in 30 Days" },
    daily_final_week: { badge: "danger", label: "Final Week Daily Alert", subject: "URGENT: Agreement/Rights Expiring This Week" },
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
    html: baseTemplate(content, `${data.items.length} items expiring - action required`),
  };
}

export interface RightsRenewedData {
  userName: string;
  movieTitle: string;
  platformName: string;
  previousEndDate: string;
  newEndDate: string;
  rightId: string;
  renewedBy: string;
}

export function rightsRenewedTemplate(data: RightsRenewedData): { subject: string; html: string } {
  const content = `
    <div style="margin-bottom: 24px;">
      ${alertBadge("success", "Rights Renewed")}
    </div>
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: ${COLORS.text};">
      Hi ${data.userName},
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
      Rights have been renewed for the following title:
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; width: 140px; font-weight: 600; color: ${COLORS.textMuted};">Movie</td>
        <td style="padding: 16px; color: ${COLORS.text}; font-weight: 600;">${data.movieTitle}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Platform</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.text};">${data.platformName}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Previous End Date</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.textMuted}; text-decoration: line-through;">${data.previousEndDate}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">New End Date</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.success}; font-weight: 600;">${data.newEndDate}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Renewed By</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.text};">${data.renewedBy}</td>
      </tr>
    </table>
    <div style="text-align: center;">
      ${button("View Rights Details", `${APP_URL}/rights`)}
    </div>
  `;

  return {
    subject: `Rights Renewed: ${data.movieTitle}`,
    html: baseTemplate(content, `Rights renewed for ${data.movieTitle} until ${data.newEndDate}`),
  };
}

export interface RightsTransferredData {
  userName: string;
  movieTitle: string;
  fromPlatform: string;
  toPlatform: string;
  newStartDate: string;
  newEndDate: string;
  newRightId: string;
  transferredBy: string;
}

export function rightsTransferredTemplate(data: RightsTransferredData): { subject: string; html: string } {
  const content = `
    <div style="margin-bottom: 24px;">
      ${alertBadge("info", "Rights Transferred")}
    </div>
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: ${COLORS.text};">
      Hi ${data.userName},
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
      Rights have been transferred for the following title:
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; width: 140px; font-weight: 600; color: ${COLORS.textMuted};">Movie</td>
        <td style="padding: 16px; color: ${COLORS.text}; font-weight: 600;">${data.movieTitle}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">From Platform</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.textMuted};">${data.fromPlatform}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">To Platform</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.success}; font-weight: 600;">${data.toPlatform}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">New Period</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.text};">${data.newStartDate} to ${data.newEndDate}</td>
      </tr>
      <tr>
        <td style="padding: 16px; background-color: ${COLORS.background}; border-top: 1px solid ${COLORS.border}; font-weight: 600; color: ${COLORS.textMuted};">Transferred By</td>
        <td style="padding: 16px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.text};">${data.transferredBy}</td>
      </tr>
    </table>
    <div style="text-align: center;">
      ${button("View New Rights", `${APP_URL}/rights`)}
    </div>
  `;

  return {
    subject: `Rights Transferred: ${data.movieTitle} to ${data.toPlatform}`,
    html: baseTemplate(content, `Rights for ${data.movieTitle} transferred from ${data.fromPlatform} to ${data.toPlatform}`),
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

export function userCreatedTemplate(data: UserCreatedData): { subject: string; html: string } {
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
    html: baseTemplate(content, `Your ${APP_NAME} account has been created`),
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

export function movieCreatedTemplate(data: MovieCreatedData): { subject: string; html: string } {
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
    html: baseTemplate(content, `New movie added to catalog: ${data.movieTitle}`),
  };
}

export interface DailyDigestData {
  userName: string;
  date: string;
  stats: {
    criticalExpiring: number;
    urgentExpiring: number;
    newMovies: number;
  };
  criticalRights?: {
    movieTitle: string;
    platformName: string;
    daysRemaining: number;
    rightId: string;
  }[];
}

export function dailyDigestTemplate(data: DailyDigestData): { subject: string; html: string } {
  const hasActivity = data.stats.newMovies > 0;

  const criticalSection =
    data.criticalRights && data.criticalRights.length > 0
      ? `
    <div style="margin-top: 32px;">
      <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: ${COLORS.danger};">Critical Rights Expiring</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden;">
        ${data.criticalRights
        .map(
          (r) => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border};">
              <strong>${r.movieTitle}</strong><br>
              <span style="font-size: 13px; color: ${COLORS.textMuted};">${r.platformName}</span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid ${COLORS.border}; text-align: right;">
              <a href="${APP_URL}/rights" style="color: ${COLORS.primary}; text-decoration: none; font-size: 12px; margin-right: 8px;">View</a>
              ${alertBadge("danger", `${r.daysRemaining}d left`)}
            </td>
          </tr>
        `
        )
        .join("")}
      </table>
    </div>
  `
      : "";

  const content = `
    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: ${COLORS.text};">
      Daily Digest for ${data.date}
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
      Hi ${data.userName}, here's your daily summary:
    </p>

    <!-- Stats Grid -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
      <tr>
        <td width="33%" style="padding: 8px;">
          <div style="background-color: ${COLORS.danger}10; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: ${COLORS.danger};">${data.stats.criticalExpiring}</div>
            <div style="font-size: 12px; color: ${COLORS.textMuted}; text-transform: uppercase;">Critical</div>
          </div>
        </td>
        <td width="33%" style="padding: 8px;">
          <div style="background-color: ${COLORS.warning}10; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: ${COLORS.warning};">${data.stats.urgentExpiring}</div>
            <div style="font-size: 12px; color: ${COLORS.textMuted}; text-transform: uppercase;">Urgent</div>
          </div>
        </td>
        <td width="33%" style="padding: 8px;">
          <div style="background-color: ${COLORS.success}10; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: ${COLORS.success};">${data.stats.newMovies}</div>
            <div style="font-size: 12px; color: ${COLORS.textMuted}; text-transform: uppercase;">New Movies</div>
          </div>
        </td>
      </tr>
    </table>

    ${hasActivity ? `
    <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: ${COLORS.text};">Today's Activity</h3>
    <ul style="margin: 0 0 24px; padding-left: 20px; color: ${COLORS.textMuted};">
      ${data.stats.newMovies > 0 ? `<li style="margin-bottom: 8px;">${data.stats.newMovies} new movie${data.stats.newMovies > 1 ? "s" : ""} added</li>` : ""}
    </ul>
    ` : `
    <p style="margin: 0 0 24px; font-size: 14px; color: ${COLORS.textMuted}; font-style: italic;">
      No activity recorded today.
    </p>
    `}

    ${criticalSection}

    <div style="margin-top: 32px; text-align: center;">
      ${button("Open Dashboard", `${APP_URL}`)}
    </div>
  `;

  return {
    subject: `Daily Digest: ${data.stats.criticalExpiring} Critical, ${data.stats.urgentExpiring} Urgent Expirations`,
    html: baseTemplate(content, `Your daily summary - ${data.stats.criticalExpiring} critical rights expiring`),
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
