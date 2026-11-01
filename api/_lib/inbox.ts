import { autoReplyDecision, type Decision } from "./autoreply.js";
import { replyAddress } from "./email.js";
import { sql } from "./db.js";
import { escapeHtml, mailConfigured, sendMail, studioInboxes, textToHtml, DEFAULT_INBOX } from "./mail.js";
import { triageConfigured, triageMessage, type StudioSettings, type Triage } from "./triage.js";

/**
 * The shared inbox. Messages from people (website enquiries now, email replies and WhatsApp next) land in
 * scotty.conversations against their lead. Claude sorts each one and drafts a reply; autoReplyDecision()
 * sends it or holds it for the operator; every step is written to scotty.agent_events.
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

type Settings = StudioSettings & { auto_reply_enabled: boolean };

async function loadSettings(operatorId: string): Promise<Settings> {
  const [s] = await q<Settings>(
    "SELECT company_name, company_website, services, booking_link, portfolio_projects, auto_reply_enabled FROM scotty.settings WHERE user_id = $1::uuid",
    [operatorId],
  );
  return s ?? { company_name: null, company_website: null, services: null, booking_link: null, portfolio_projects: null, auto_reply_enabled: true };
}

/** One line in the Agent activity log. */
export async function logEvent(
  operatorId: string,
  e: { kind: string; summary: string; leadId?: string | null; conversationId?: string | null; details?: Record<string, unknown> },
) {
  await q(
    `INSERT INTO scotty.agent_events (user_id, lead_id, conversation_id, kind, summary, details)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb)`,
    [operatorId, e.leadId ?? null, e.conversationId ?? null, e.kind, e.summary, JSON.stringify(e.details ?? {})],
  );
}

/** Records a website enquiry, sorts it, replies on its own when that's safe, and tells the studio. */
export async function recordEnquiry(e: Enquiry, operatorId: string) {
  const email = e.email.trim().toLowerCase();
  const details = [e.service && `Service: ${e.service}`, e.budget && `Budget: ${e.budget}`].filter(Boolean).join(" · ");

  // One lead per person: an outreach lead who fills in the form joins their existing thread.
  let [lead] = await q<{ id: string; business_name: string }>(
    "SELECT id, business_name FROM scotty.leads WHERE user_id = $1::uuid AND lower(email) = $2 ORDER BY created_at LIMIT 1",
    [operatorId, email],
  );
  const isNew = !lead;
  if (!lead) {
    [lead] = await q(
      `INSERT INTO scotty.leads (user_id, business_name, email, phone, status, discovery_source, verification_state, has_website, notes)
       VALUES ($1::uuid, $2, $3, $4, 'interested', 'website', 'verified', NULL, $5)
       RETURNING id, business_name`,
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

  const who = e.name.trim() || email;
  await logEvent(operatorId, {
    kind: "received",
    summary: `New website enquiry from ${who}${isNew ? " (new lead)" : ""}`,
    leadId: lead.id,
    conversationId: conv.id,
  });
  return afterInbound({ conversationId: conv.id, leadId: lead.id, who, email, isNew, channel: "website" }, operatorId);
}

/** Sort, decide, reply or hold, and tell the studio: the same for every inbound message, whatever the channel. */
async function afterInbound(
  m: { conversationId: string; leadId: string; who: string; email: string; isNew: boolean; channel: "website" | "email" },
  operatorId: string,
) {
  let triage: Triage | null = null;
  try {
    triage = await sortConversation(m.conversationId, operatorId, { renameNewLead: m.isNew });
  } catch (err) {
    console.error("inbox: triage failed", err);
    await logEvent(operatorId, { kind: "error", summary: `Couldn't sort ${m.who}'s message: ${(err as Error).message}`, leadId: m.leadId, conversationId: m.conversationId });
  }

  const decision = await decideAndAct(m.conversationId, m.leadId, triage, operatorId, triage?.business ?? m.who);
  if (decision.action !== "skipped") {
    await alert({ name: m.who, email: m.email, business: triage?.business ?? null, channel: m.channel }, triage, decision).catch((err) =>
      console.error("inbox: alert failed", err),
    );
  }
  return { leadId: m.leadId, conversationId: m.conversationId, triaged: Boolean(triage), action: decision.action };
}

export type EmailReply = {
  /** Resend's id for the received email. */
  id: string;
  from: string;
  fromName: string | null;
  subject: string;
  /** Only what they wrote this time, quoted history removed. */
  text: string;
  automated: boolean;
  unsubscribe: boolean;
  /** The lead named in our reply address, when they replied to one of Scotty's emails. */
  leadId: string | null;
};

/**
 * Records an email someone sent to Scotty's reply address, then runs it through the same pipeline as a
 * website enquiry. Auto-responders are recorded but never answered; "STOP" marks the person don't-contact.
 */
export async function recordEmailReply(r: EmailReply, operatorId: string) {
  const email = r.from.trim().toLowerCase();

  // The reply address names the lead; fall back to the sender's address; else it's someone new.
  let lead: { id: string; business_name: string } | undefined;
  if (r.leadId) {
    [lead] = await q<{ id: string; business_name: string }>("SELECT id, business_name FROM scotty.leads WHERE id = $1::uuid AND user_id = $2::uuid", [r.leadId, operatorId]);
  }
  if (!lead) {
    [lead] = await q<{ id: string; business_name: string }>(
      "SELECT id, business_name FROM scotty.leads WHERE user_id = $1::uuid AND lower(email) = $2 ORDER BY created_at LIMIT 1",
      [operatorId, email],
    );
  }
  const isNew = !lead;
  if (!lead) {
    [lead] = await q<{ id: string; business_name: string }>(
      `INSERT INTO scotty.leads (user_id, business_name, email, status, discovery_source, verification_state, has_website, notes)
       VALUES ($1::uuid, $2, $3, 'interested', 'email', 'verified', NULL, 'Emailed Scotty directly.')
       RETURNING id, business_name`,
      [operatorId, r.fromName || email, email],
    );
  }

  const [conv] = await q<{ id: string }>(
    `INSERT INTO scotty.conversations (user_id, lead_id, direction, channel, subject, message, external_id)
     VALUES ($1::uuid, $2::uuid, 'inbound', 'email', $3, $4, $5)
     ON CONFLICT (external_id) DO NOTHING RETURNING id`,
    [operatorId, lead.id, r.subject || null, r.text || "(no text)", `email:${r.id}`],
  );
  if (!conv) return { leadId: lead.id, duplicate: true as const };
  const who = r.fromName || lead.business_name || email;

  if (r.automated) {
    await q("UPDATE scotty.conversations SET agent_action = 'skipped', agent_reason = 'Automatic email (out of office or bounce)' WHERE id = $1::uuid", [conv.id]);
    await logEvent(operatorId, { kind: "skipped", summary: `Ignored an automatic email from ${who}`, leadId: lead.id, conversationId: conv.id });
    return { leadId: lead.id, conversationId: conv.id, action: "skipped" as const };
  }

  if (r.unsubscribe) {
    await q("UPDATE scotty.leads SET unsubscribed = true, status = 'not_interested' WHERE id = $1::uuid AND user_id = $2::uuid", [lead.id, operatorId]);
    await q("UPDATE scotty.conversations SET agent_action = 'skipped', agent_reason = 'Asked not to be contacted' WHERE id = $1::uuid", [conv.id]);
    await logEvent(operatorId, { kind: "skipped", summary: `${who} asked not to be contacted. Marked don't contact.`, leadId: lead.id, conversationId: conv.id });
    return { leadId: lead.id, conversationId: conv.id, action: "skipped" as const };
  }

  // A reply means they're engaged; never move a lead backwards.
  await q(
    "UPDATE scotty.leads SET status = CASE WHEN status IN ('discovered', 'qualified', 'contacted') THEN 'responded' ELSE status END WHERE id = $1::uuid AND user_id = $2::uuid",
    [lead.id, operatorId],
  );
  await logEvent(operatorId, { kind: "received", summary: `${who} replied by email${isNew ? " (new lead)" : ""}`, leadId: lead.id, conversationId: conv.id });
  return afterInbound({ conversationId: conv.id, leadId: lead.id, who, email, isNew, channel: "email" }, operatorId);
}

/** Applies autoReplyDecision() to a freshly sorted inbound message, and sends when it says so. */
async function decideAndAct(conversationId: string, leadId: string, triage: Triage | null, operatorId: string, name: string): Promise<Decision> {
  const settings = await loadSettings(operatorId);
  const check = await canReply(leadId, operatorId);
  const [{ n }] = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM scotty.conversations
      WHERE lead_id = $1::uuid AND user_id = $2::uuid AND sent_by = 'auto' AND created_at > now() - interval '24 hours'`,
    [leadId, operatorId],
  );
  let decision = autoReplyDecision(triage, {
    enabled: settings.auto_reply_enabled,
    canReply: check.ok ? { ok: true } : check,
    autoRepliesLast24h: n,
  });

  if (decision.action === "auto_replied" && triage?.reply) {
    try {
      await sendReply({ lead_id: leadId, subject: triage.reply.subject, message: triage.reply.body }, operatorId, "auto");
    } catch (err) {
      decision = { action: "held", reason: `The automatic reply failed to send: ${(err as Error).message}` };
    }
  }

  await q("UPDATE scotty.conversations SET agent_action = $3, agent_reason = $4 WHERE id = $1::uuid AND user_id = $2::uuid", [
    conversationId,
    operatorId,
    decision.action,
    decision.action === "auto_replied" ? null : decision.reason,
  ]);
  await logEvent(operatorId, {
    kind: decision.action,
    summary:
      decision.action === "auto_replied"
        ? `Replied to ${name} automatically`
        : decision.action === "held"
          ? `Held ${name}'s message for you: ${decision.reason}`
          : `Ignored a message as spam`,
    leadId,
    conversationId,
    details: { category: triage?.category ?? null, urgency: triage?.urgency ?? null },
  });
  return decision;
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

  // Earlier messages in the thread, oldest first, so a reply is answered in context.
  const history = (
    await q<{ direction: string; message: string; created_at: string }>(
      `SELECT direction, message, created_at FROM scotty.conversations
        WHERE lead_id = $1::uuid AND user_id = $2::uuid AND id <> $3::uuid
        ORDER BY created_at DESC LIMIT 8`,
      [row.lead_id, operatorId, conversationId],
    )
  )
    .reverse()
    .map((h) => ({ from: (h.direction === "inbound" ? "them" : "us") as "them" | "us", at: h.created_at, text: h.message.slice(0, 2000) }));

  const triage = await triageMessage(await loadSettings(operatorId), {
    channel: row.channel,
    from: { name: row.business_name, email: row.email, phone: row.phone },
    subject: row.subject,
    body: row.message,
    history,
  });
  if (!triage) throw new Error("Claude declined to sort this message.");

  await q(
    `UPDATE scotty.conversations SET category = $3, urgency = $4, summary = $5, ai_suggested_subject = $6, ai_suggested_reply = $7, needs_human = $8
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [conversationId, operatorId, triage.category, triage.urgency, triage.summary, triage.reply?.subject ?? null, triage.reply?.body ?? null, triage.needs_human],
  );
  // A new lead is named after the person until we learn the business's name.
  if (opts.renameNewLead && triage.business) {
    await q("UPDATE scotty.leads SET business_name = $3 WHERE id = $1::uuid AND user_id = $2::uuid", [row.lead_id, operatorId, triage.business]);
  }
  return triage;
}

async function alert(from: { name: string; email: string; business: string | null; channel: "website" | "email" }, triage: Triage | null, decision: Decision) {
  if (!mailConfigured()) return;
  const who = from.business ? `${from.name} (${from.business})` : from.name || from.email;
  const link = `${appUrl()}/inbox`;
  const replied = decision.action === "auto_replied";
  const lines = [
    triage?.summary ?? (from.channel === "email" ? `${who} replied by email.` : `${who} sent an enquiry through the website.`),
    triage?.suggested_package ? `Best fit: ${triage.suggested_package}` : null,
    "",
    replied
      ? `Scotty replied automatically:\n\n${triage?.reply?.body ?? ""}`
      : `Scotty held this for you: ${decision.action === "held" ? decision.reason : ""}.${triage?.reply ? `\n\nA draft is waiting in Scotty:\n\n${triage.reply.body}` : ""}`,
  ].filter((l): l is string => l !== null);
  const tag = replied ? (triage?.urgency === "high" ? "Hot lead, replied" : "Replied") : "Needs you";
  await sendMail({
    to: studioInboxes(),
    subject: `${tag}: ${who}`,
    text: `${lines.join("\n")}\n\nOpen Scotty: ${link}`,
    html: `${textToHtml(lines.join("\n"))}<p><a href="${escapeHtml(link)}">Open Scotty</a></p>`,
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

export async function sendReply(input: { lead_id: string; message: string; subject?: string }, operatorId: string, sentBy: "operator" | "auto" = "operator") {
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
    // With inbound set up, replies come back to Scotty tagged with the lead; otherwise to the studio inbox.
    replyTo: process.env.INBOUND_DOMAIN ? replyAddress(input.lead_id, process.env.INBOUND_DOMAIN) : process.env.REPLY_TO || DEFAULT_INBOX,
    subject,
    text: message,
  });
  const [conv] = await q<{ id: string; created_at: string }>(
    `INSERT INTO scotty.conversations (user_id, lead_id, direction, channel, subject, message, external_id, sent_by)
     VALUES ($1::uuid, $2::uuid, 'outbound', 'email', $3, $4, $5, $6) RETURNING id, created_at`,
    [operatorId, input.lead_id, subject, message, id, sentBy],
  );
  if (sentBy === "operator") {
    await logEvent(operatorId, { kind: "operator_replied", summary: "You sent a reply", leadId: input.lead_id, conversationId: conv.id, details: { email_id: id } });
  }
  return conv;
}
