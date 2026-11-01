/**
 * Email through Resend, for alerts to the studio and replies to people who wrote to us first.
 * Resend's acceptable use policy forbids cold outreach, so nothing may use this to start a conversation:
 * see canReply() in inbox.ts. First emails to businesses go from the outreach mailbox instead (smtp.ts).
 *
 * Env:
 *   RESEND_API_KEY  required
 *   MAIL_FROM       sender for alerts, e.g. "Scotty <scotty@code5developers.com>"
 *   REPLY_FROM      sender for replies, e.g. "Code 5 Developers <info@code5developers.com>"
 *   REPLY_TO        where replies to our replies go; defaults to info@code5developers.com
 *   STUDIO_INBOX    comma-separated inboxes for alerts; defaults to info@code5developers.com
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DEFAULT_INBOX = "info@code5developers.com";

export const studioInboxes = () => {
  const list = (process.env.STUDIO_INBOX ?? "").split(",").map((s) => s.trim()).filter((s) => EMAIL_RE.test(s));
  return list.length ? list : [DEFAULT_INBOX];
};

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const textToHtml = (s: string) =>
  `<div style="white-space:pre-wrap;font-family:system-ui,sans-serif;line-height:1.5">${escapeHtml(s)}</div>`;

/** Sends one email; returns Resend's id or throws with Resend's message. */
export async function sendMail(m: { from?: string; to: string[]; subject: string; text: string; html?: string; replyTo?: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = m.from ?? process.env.MAIL_FROM;
  if (!key || !from) throw new Error("Email isn't set up: RESEND_API_KEY or MAIL_FROM is missing.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html ?? textToHtml(m.text),
      ...(m.replyTo ? { reply_to: m.replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}
