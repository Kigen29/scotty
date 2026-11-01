import { Webhook } from "svix";
import { bareAddress, displayName, isAutomated, isUnsubscribe, leadIdFromAddresses, stripQuoted } from "../_lib/email.js";
import { recordEmailReply } from "../_lib/inbox.js";
import { json, operator } from "../_lib/session.js";

/**
 * Resend's `email.received` webhook, for mail sent to the inbound domain (replies to Scotty's emails go to
 * reply+<lead>@INBOUND_DOMAIN). The webhook only carries metadata, so the body is fetched from Resend.
 *
 * Env: RESEND_WEBHOOK_SECRET (the endpoint's signing secret), RESEND_API_KEY, INBOUND_DOMAIN
 */

type Received = {
  type: string;
  data: { email_id: string; from: string; to?: string[]; received_for?: string[]; subject?: string };
};

type ReceivedEmail = {
  from?: string;
  subject?: string;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string | string[]>;
};

/**
 * Plain text from an HTML email. The result is stored and shown as text, never rendered as HTML. Tags are
 * stripped until none remain, any stray angle brackets are dropped, and &amp; is decoded last so that
 * "&amp;lt;" can't become "<".
 */
function htmlToText(html: string) {
  let t = html
    .replace(/<blockquote[\s\S]*?<\/blockquote\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)\s*>/gi, "\n");
  let prev: string;
  do {
    prev = t;
    t = t.replace(/<[^<>]*>/g, "");
  } while (t !== prev);
  return t
    .replace(/[<>]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&(lt|gt);/g, "")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const op = operator();
  if (!secret || !op) return json({ error: "Inbound email isn't configured." }, 503);

  // The signature covers the exact bytes, so verify the raw body before parsing it.
  const raw = await req.text();
  try {
    new Webhook(secret).verify(raw, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    });
  } catch {
    return json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(raw) as Received;
  if (event.type !== "email.received") return json({ ignored: event.type });

  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(event.data.email_id)}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!res.ok) throw new Error(`Resend returned ${res.status} fetching the email: ${await res.text()}`);
    const email = (await res.json()) as ReceivedEmail;

    const fromHeader = email.from ?? event.data.from;
    const subject = email.subject ?? event.data.subject ?? "";
    const body = email.text?.trim() ? email.text : email.html ? htmlToText(email.html) : "";
    const text = stripQuoted(body);
    const to = [...(event.data.to ?? []), ...(event.data.received_for ?? [])];

    const result = await recordEmailReply(
      {
        id: event.data.email_id,
        from: bareAddress(fromHeader),
        fromName: displayName(fromHeader),
        subject,
        text,
        automated: isAutomated(email.headers ?? {}, fromHeader, subject),
        unsubscribe: isUnsubscribe(text),
        leadId: process.env.INBOUND_DOMAIN ? leadIdFromAddresses(to, process.env.INBOUND_DOMAIN) : null,
      },
      op.id,
    );
    return json(result);
  } catch (err) {
    // A 5xx makes Resend retry; recording is idempotent on the email id, so a retry can't duplicate.
    console.error("inbound/email:", err);
    return json({ error: "Could not record the email." }, 500);
  }
}
