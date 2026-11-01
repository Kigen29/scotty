import nodemailer, { type Transporter } from "nodemailer";

/**
 * The outreach mailbox (outreach@code5developers.com on Truehost), for the first email to a business that hasn't
 * written to us. Kept apart from Resend, whose policy forbids cold outreach, and from info@, so a spam complaint
 * can't hurt the studio's main inbox. Replies are routed back to Scotty with Reply-To.
 *
 * Env:
 *   SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASSWORD   the mailbox
 *   OUTREACH_FROM          e.g. "Emmanuel Kigen <outreach@code5developers.com>"; defaults to SMTP_USER
 *   OUTREACH_DAILY_LIMIT   first emails per day, default 20
 */

export const outreachConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
export const outreachDailyLimit = () => Math.max(0, Number(process.env.OUTREACH_DAILY_LIMIT ?? 20) || 0);

let transport: Transporter | undefined;

/**
 * Sends one email from the outreach mailbox; returns the Message-ID. Plain text only, with no bulk-mail headers:
 * it should read and file like a personal note, not a newsletter.
 */
export async function sendOutreachMail(m: { to: string; subject: string; text: string; replyTo: string }) {
  if (!outreachConfigured()) throw new Error("The outreach mailbox isn't set up: add SMTP_HOST, SMTP_USER and SMTP_PASSWORD in Vercel.");
  const port = Number(process.env.SMTP_PORT ?? 465);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  const info = await transport.sendMail({
    from: process.env.OUTREACH_FROM || process.env.SMTP_USER,
    to: m.to,
    replyTo: m.replyTo,
    subject: m.subject,
    text: m.text,
  });
  return info.messageId;
}
