import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { recordEnquiry } from "../_lib/inbox.js";
import { json, operator } from "../_lib/session.js";

/**
 * code5developers.com posts each contact-form enquiry here, after emailing it to the studio.
 * Authenticated with a shared secret: `Authorization: Bearer $INBOUND_SECRET` (set on both projects).
 */

const Body = z.object({
  id: z.string().min(8).max(100),
  name: z.string().max(200),
  email: z.email().max(200),
  phone: z.string().max(200).optional(),
  service: z.string().max(200).optional(),
  budget: z.string().max(200).optional(),
  message: z.string().min(1).max(5000),
});

const digest = (s: string) => createHash("sha256").update(s).digest();

function authorised(req: Request) {
  const secret = process.env.INBOUND_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return timingSafeEqual(digest(given), digest(secret));
}

export async function POST(req: Request) {
  if (!authorised(req)) return json({ error: "Unauthorized" }, 401);
  const op = operator();
  if (!op) return json({ error: "OPERATOR_USER_ID is not set." }, 500);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid enquiry.", issues: parsed.error.issues.map((i) => i.path.join(".")) }, 400);

  try {
    return json(await recordEnquiry(parsed.data, op.id));
  } catch (err) {
    console.error("inbound/website:", err);
    return json({ error: "Could not record the enquiry." }, 500);
  }
}
