import { sql } from "./db.js";
import { escapeHtml, mailConfigured, sendMail, studioInboxes, textToHtml, DEFAULT_INBOX } from "./mail.js";
import { triageConfigured, triageMessage, type StudioSettings, type Triage } from "./triage.js";

/**
 * The shared inbox. Messages from people (website enquiries now, email replies and WhatsApp next)
 * land in scotty.conversations against their lead, get sorted by Claude, and are answered only when
 * the operator presses Send.
 */

type Row = Record<string, unknown>;
const q = async <T = Row>(text: string, values: unknown[] = []) => (await sql().query(text, values)) as T[];

export type Enquiry = {
  /** The website's id for this submission, so a retried delivery isn't recorded twice. */
  id: string;
  name: string;
  email: string;
  phone?: string;
  service?: string;
  budget?: string;
  message: string;
};

const appUrl = () => (process.env.APP_URL ?? "https://scotty.code5developers.com").replace(/\/$/, "");

async function loadSettings(operatorId: string): Promise<StudioSettings> {
  const [s] = await q<StudioSettings>(
    "SELECT company_name, company_website, services, booking_link, portfolio_projects FROM scotty.settings WHERE user_id = $1::uuid",
    [operatorId],
  );
  return s ?? { company_name: null, company_website: null, services: null, booking_link: null, portfolio_projects: null };
}

/** Records a website enquiry, sorts it with Claude, and alerts the studio. */
export async function recordEnquiry(e: Enquiry, operatorId: string) {
  const email = e.email.trim().toLowerCase();
  const details = [e.service && `Service: ${e.service}`, e.budget && `Budget: ${e.budget}`].filter(Boolean).join(" · ");

  // One lead per person: an outreach lead who fills in the form joins their existing thread.
  let [lead] = await q<{ id: string; business_name: string; status: string }>(
    "SELECT id, business_name, status FROM scotty.leads WHERE user_id = $1::uuid AND lower(email) = $2 ORDER BY created_at LIMIT 1",
    [operatorId, email],
  );
  const isNew = !lead;
  if (!lead) {
    [lead] = await q(
      `INSERT INTO scotty.leads (user_id, business_name, email, phone, status, discovery_source, verification_state, has_website, notes)
       VALUES ($1::uuid, $2, $3, $4, 'interested', 'website', 'verified', NULL, $5)
       RETURNING id, business_name, status`,
      [operatorId, e.name.trim() || email, email, e.phone?.trim() || null, details ? `Website enquiry. ${details}` : "Website enquiry."],
    );
  } else {
    // They came to us, so they're at least interested; don't move anyone backwards.
    await q(
      `UPDATE scotty.leads SET phone = coalesce(phone, $3),
         status = CASE WHEN status IN ('discovered', 'qualified', 'contacted', 'responded') THEN 'interested' ELSE status END
       WHERE id = $1::uuid AND user_id = $2::uuid`,
      [lead.id, operatorId, e.phone?.trim() || null],
    );
  }

  const subject = e.service ? `Website enquiry: ${e.service}` : "Website enquiry";
  const body = details ? `${e.message.trim()}\n\n${details}` : e.message.trim();
  const [conv] = await q<{ id: string }>(
    `INSERT INTO scotty.conversations (user_id, lead_id, direction, channel, subject, message, external_id)
     VALUES ($1::uuid, $2::uuid, 'inbound', 'website', $3, $4, $5)
     ON CONFLICT (external_id) DO NOTHING RETURNING id`,
    [operatorId, lead.id, subject, body, `website:${e.id}`],
  );
  if (!conv) return { leadId: lead.id, duplicate: true as const };

  await q("INSERT INTO scotty.activity_logs (user_id, action, details) VALUES ($1::uuid, 'website_enquiry', $2::jsonb)", [
    operatorId,
    JSON.stringify({ lead_id: lead.id, conversation_id: conv.id, new_lead: isNew }),
  ]);

  let triage: Triage | null = null;
  try {
    triage = await sortConversation(conv.id, operatorId, { renameNewLead: isNew });
  } catch (err) {
    console.error("inbox: triage failed", err);
  }

  if (triage?.category !== "spam") await alert({ name: e.name, email, business: triage?.business ?? null }, triage).catch((err) =>
    console.error("inbox: alert failed", err),
  );
  return { leadId: lead.id, conversationId: conv.id, triaged: Boolean(triage) };
}

/**
 * Runs Claude on an inbound message and stores the result, including the suggested reply.
 * Used on arrival and by the "Sort with Claude" button when the first attempt failed.
 */
export async function sortConversation(conversationId: string, operatorId: string, opts: { renameNewLead?: boolean } = {}) {
  if (!triageConfigured()) throw new Error("Claude isn't set up: ANTHROPIC_API_KEY is missing.");
  const [row] = await q<{ channel: "website" | "email" | "whatsapp"; subject: string | null; message: string; lead_id: string; business_name: string; email: string | null; phone: string | null }>(
    `SELECT c.channel, c.subject, c.message, c.lead_id, l.business_name, l.email, l.phone
       FROM scotty.conversations c JOIN scotty.leads l ON l.id = c.lead_id
      WHERE c.id = $1::uuid AND c.user_id = $2::uuid AND c.direction = 'inbound'`,
    [conversationId, operatorId],
  );
  if (!row) throw new Error("That message wasn't found.");

  const triage = await triageMessage(await loadSettings(operatorId), {
    channel: row.channel,
    from: { name: row.business_name, email: row.email, phone: row.phone },
    subject: row.subject,
    body: row.message,
  });
  if (!triage) throw new Error("Claude declined to sort this message.");

  await q(
    `UPDATE scotty.conversations SET category = $3, urgency = $4, summary = $5, ai_suggested_subject = $6, ai_suggested_reply = $7
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [conversationId, operatorId, triage.category, triage.urgency, triage.summary, triage.reply?.subject ?? null, triage.reply?.body ?? null],
  );
  // A new lead is named after the person until we learn the business's name.
  if (opts.renameNewLead && triage.business) {
    await q("UPDATE scotty.leads SET business_name = $3 WHERE id = $1::uuid AND user_id = $2::uuid", [row.lead_id, operatorId, triage.business]);
  }
  return triage;
}

async function alert(from: { name: string; email: string; business: string | null }, triage: Triage | null) {
  if (!mailConfigured()) return;
  const who = from.business ? `${from.name} (${from.business})` : from.name || from.email;
  const link = `${appUrl()}/conversations`;
  const lines = [
    triage?.summary ?? `${who} sent an enquiry through the website.`,
    triage?.suggested_package ? `Best fit: ${triage.suggested_package}` : null,
    "",
    triage?.reply ? `Suggested reply, waiting in Scotty for you to check and send:\n\n${triage.reply.body}` : "No reply was drafted.",
  ].filter((l): l is string => l !== null);
  await sendMail({
    to: studioInboxes(),
    subject: `${triage?.urgency === "high" ? "Hot lead" : "New enquiry"}: ${who}`,
    text: `${lines.join("\n")}\n\nOpen it in Scotty: ${link}`,
    html: `${textToHtml(lines.join("\n"))}<p><a href="${escapeHtml(link)}">Open it in Scotty</a></p>`,
  });
}

/**
 * Scotty may only email someone who has written to us first. That keeps it inside Resend's policy
 * (no cold outreach) and Kenya's consent rules for marketing. Cold outreach gets its own setup later.
 */
export async function canReply(leadId: string, operatorId: string) {
  const [lead] = await q<{ email: string | null; unsubscribed: boolean | null; inbound: number }>(
    `SELECT l.email, l.unsubscribed,
            (SELECT count(*)::int FROM scotty.conversations c WHERE c.lead_id = l.id AND c.direction = 'inbound') AS inbound
       FROM scotty.leads l WHERE l.id = $1::uuid AND l.user_id = $2::uuid`,
    [leadId, operatorId],
  );
  if (!lead) return { ok: false as const, reason: "That lead wasn't found." };
  if (!lead.email) return { ok: false as const, reason: "This lead has no email address." };
  if (lead.unsubscribed) return { ok: false as const, reason: "This person asked not to be contacted." };
  if (!lead.inbound) {
    return { ok: false as const, reason: "Scotty only replies to people who have written to you first. Cold outreach will go through the separate outreach setup." };
  }
  return { ok: true as const, email: lead.email };
}

export async function sendReply(input: { lead_id: string; message: string; subject?: string }, operatorId: string) {
  const message = String(input.message ?? "").trim();
  if (!message) throw new Error("The reply is empty.");
  const check = await canReply(input.lead_id, operatorId);
  if (!check.ok) throw new Error(check.reason);

  const [last] = await q<{ subject: string | null; ai_suggested_subject: string | null }>(
    `SELECT subject, ai_suggested_subject FROM scotty.conversations
      WHERE lead_id = $1::uuid AND user_id = $2::uuid AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1`,
    [input.lead_id, operatorId],
  );
  const subject = input.subject?.trim() || last?.ai_suggested_subject || (last?.subject ? `Re: ${last.subject}` : "Re: your enquiry");

  // Send first, record after: a failed send must never show up as a sent message.
  const id = await sendMail({
    from: process.env.REPLY_FROM || process.env.MAIL_FROM,
    to: [check.email],
    replyTo: process.env.REPLY_TO || DEFAULT_INBOX,
    subject,
    text: message,
  });
  const [conv] = await q<{ id: string; created_at: string }>(
    `INSERT INTO scotty.conversations (user_id, lead_id, direction, channel, subject, message, external_id)
     VALUES ($1::uuid, $2::uuid, 'outbound', 'email', $3, $4, $5) RETURNING id, created_at`,
    [operatorId, input.lead_id, subject, message, id],
  );
  await q("INSERT INTO scotty.activity_logs (user_id, action, details) VALUES ($1::uuid, 'reply_sent', $2::jsonb)", [
    operatorId,
    JSON.stringify({ lead_id: input.lead_id, conversation_id: conv.id, email_id: id }),
  ]);
  return conv;
}
