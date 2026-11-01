import { recordWhatsApp } from "../_lib/inbox.js";
import { json, operator } from "../_lib/session.js";
import { parseInbound, validSignature } from "../_lib/whatsapp.js";

/**
 * Meta's WhatsApp webhook. GET is the one-time verification when the webhook is saved in the Meta app; POST carries
 * messages people send to the studio's number, each recorded and answered through the same pipeline as email.
 */

export function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === token) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const op = operator();
  if (!secret || !op) return json({ error: "WhatsApp isn't configured." }, 503);

  // The signature covers the exact bytes, so verify the raw body before parsing it.
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"), secret)) return json({ error: "Invalid signature" }, 401);

  const messages = parseInbound(JSON.parse(raw));
  try {
    const results = [];
    for (const m of messages) results.push(await recordWhatsApp(m, op.id));
    return json({ received: messages.length, results });
  } catch (err) {
    // A 5xx makes Meta retry; recording is idempotent on the message id, so a retry can't duplicate.
    console.error("inbound/whatsapp:", err);
    return json({ error: "Could not record the message." }, 500);
  }
}
