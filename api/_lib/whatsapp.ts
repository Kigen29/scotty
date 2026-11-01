import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp through Meta's Cloud API. Two uses only, both inside Meta's rules and Kenya's consent law:
 *   - answering people who message the studio (free-form replies within 24 hours of their last message), and
 *   - sending the free audit to someone who agreed to receive it (an approved template once that window is closed).
 * Never a first message to someone who hasn't agreed.
 *
 * Env:
 *   WHATSAPP_TOKEN            system user access token with whatsapp_business_messaging
 *   WHATSAPP_PHONE_NUMBER_ID  the sending number's id (WhatsApp Manager → API setup)
 *   WHATSAPP_APP_SECRET       the Meta app's secret, to verify webhook signatures
 *   WHATSAPP_VERIFY_TOKEN     any string, also entered in the app's webhook settings
 *   WHATSAPP_AUDIT_TEMPLATE   approved template name for sending the audit, default "free_audit_ready"
 *   WHATSAPP_TEMPLATE_LANG    its language code, default "en"
 */

const GRAPH = "https://graph.facebook.com/v26.0";

export const whatsappConfigured = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/** Free-form messages are allowed for 24 hours after their last message. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Kenyan numbers in any common format → WhatsApp digits, e.g. "0719 587323" → "254719587323". */
export function whatsappDigits(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (/^254\d{9}$/.test(d)) return d;
  if (/^0[17]\d{8}$/.test(d)) return `254${d.slice(1)}`;
  if (/^[17]\d{8}$/.test(d)) return `254${d}`;
  return d.length >= 10 ? d : null;
}

/** Meta signs each webhook with the app secret: X-Hub-Signature-256: sha256=<hex HMAC of the raw body>. */
export function validSignature(raw: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"));
  const got = Buffer.from(header.slice(7));
  return want.length === got.length && timingSafeEqual(want, got);
}

export type InboundWhatsApp = { id: string; from: string; name: string | null; text: string; at: string };

type Payload = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: { id: string; from: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
      };
    }[];
  }[];
};

const LABELS: Record<string, string> = {
  image: "[sent a photo]",
  video: "[sent a video]",
  audio: "[sent a voice note]",
  document: "[sent a document]",
  sticker: "[sent a sticker]",
  location: "[shared a location]",
  contacts: "[shared a contact]",
};

/** The messages in a webhook delivery. Status updates (sent, delivered, read) carry none and are ignored. */
export function parseInbound(body: unknown): InboundWhatsApp[] {
  const p = body as Payload;
  if (p?.object !== "whatsapp_business_account") return [];
  const out: InboundWhatsApp[] = [];
  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const names = new Map((change.value?.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of change.value?.messages ?? []) {
        const text =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          LABELS[m.type ?? ""] ??
          `[sent a ${m.type ?? "message"}]`;
        out.push({
          id: m.id,
          from: m.from,
          name: names.get(m.from) ?? null,
          text,
          at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
        });
      }
    }
  }
  return out;
}

async function send(body: Record<string, unknown>) {
  if (!whatsappConfigured()) throw new Error("WhatsApp isn't set up: add WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Vercel.");
  const res = await fetch(`${GRAPH}/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID!)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
  });
  if (!res.ok) throw new Error(`WhatsApp refused the message (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { messages?: { id: string }[] }).messages?.[0]?.id ?? null;
}

/** A free-form message. Only valid within 24 hours of their last message. */
export const sendWhatsAppText = (to: string, text: string) => send({ to, type: "text", text: { preview_url: true, body: text } });

/** An approved template, for when the 24-hour window is closed. */
export const sendWhatsAppTemplate = (to: string, name: string, params: string[], lang = process.env.WHATSAPP_TEMPLATE_LANG || "en") =>
  send({
    to,
    type: "template",
    template: { name, language: { code: lang }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
  });
