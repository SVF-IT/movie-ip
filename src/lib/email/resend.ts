import { Resend } from "resend";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender email - configure in environment
const DEFAULT_FROM = process.env.EMAIL_FROM || "Film IP Manager <notifications@filmip.app>";

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  tags?: { name: string; value: string }[];
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an email using Resend
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      cc: options.cc,
      bcc: options.bcc,
      tags: options.tags,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error("Email send error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Send batch emails (up to 100 at a time)
 */
export async function sendBatchEmails(
  emails: EmailOptions[]
): Promise<EmailResult[]> {
  const results: EmailResult[] = [];

  // Resend supports batch sending, but we'll do it individually for better error handling
  for (const email of emails) {
    const result = await sendEmail(email);
    results.push(result);
  }

  return results;
}

export { resend };
