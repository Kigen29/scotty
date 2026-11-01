import { timingSafeEqual, createHash } from "node:crypto";
import { sql } from "../_lib/db.js";
import { escapeHtml, mailConfigured, sendMail, studioInboxes, textToHtml } from "../_lib/mail.js";
import { json, operator } from "../_lib/session.js";
import { threads } from "../_lib/views.js";

/**
 * The owner's email, sent by Vercel Cron (vercel.json):
 *   /api/cron/digest              every morning, the last 24 hours
 *   /api/cron/digest?period=week  Monday mornings, the last 7 days, plus the pipeline
 *
 * Vercel calls it with `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */

type Row = Record<string, unknown>;
const q = async <T = Row>(text: string, values: unknown[] = []) => (await sql().query(text, values)) as T[];
const digest = (s: string) => createHash("sha256").update(s).digest();
const appUrl = () => (process.env.APP_URL ?? "https://scotty.code5developers.com").replace(/\/$/, "");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !timingSafeEqual(digest(given), digest(secret))) return json({ error: "Unauthorized" }, 401);
  const op = operator();
  if (!op || !mailConfigured()) return json({ skipped: "OPERATOR_USER_ID or email isn't configured" });

  const weekly = new URL(req.url).searchParams.get("period") === "week";
  const days = weekly ? 7 : 1;

  const [c] = await q<{ received: number; auto: number; held: number; you: number; discovered: number; qualified: number; new_leads: number }>(
    `SELECT
       (SELECT count(*)::int FROM scotty.conversations WHERE user_id = $1::uuid AND direction = 'inbound' AND created_at > now() - make_interval(days => $2)) AS received,
       (SELECT count(*)::int FROM scotty.conversations WHERE user_id = $1::uuid AND sent_by = 'auto' AND created_at > now() - make_interval(days => $2)) AS auto,
       (SELECT count(*)::int FROM scotty.conversations WHERE user_id = $1::uuid AND agent_action = 'held' AND created_at > now() - make_interval(days => $2)) AS held,
       (SELECT count(*)::int FROM scotty.conversations WHERE user_id = $1::uuid AND sent_by = 'operator' AND created_at > now() - make_interval(days => $2)) AS you,
       (SELECT count(*)::int FROM scotty.leads WHERE user_id = $1::uuid AND discovery_source = 'google_places' AND created_at > now() - make_interval(days => $2)) AS discovered,
       (SELECT count(*)::int FROM scotty.leads WHERE user_id = $1::uuid AND discovery_source = 'google_places' AND status = 'qualified' AND created_at > now() - make_interval(days => $2)) AS qualified,
       (SELECT count(*)::int FROM scotty.leads WHERE user_id = $1::uuid AND discovery_source IN ('website', 'email') AND created_at > now() - make_interval(days => $2)) AS new_leads`,
    [op.id, days],
  );

  const waiting = (await threads(op.id)).filter((t) => t.state === "needs_you");
  const calls = await q<{ business_name: string; phone: string | null; reason: string | null }>(
    `SELECT business_name, phone, analysis->>'agent_reason' AS reason FROM scotty.leads
      WHERE user_id = $1::uuid AND discovery_source = 'google_places' AND status = 'qualified'
      ORDER BY icp_score DESC NULLS LAST, created_at DESC LIMIT 5`,
    [op.id],
  );

  const period = weekly ? "this week" : "since yesterday";
  const lines: string[] = [
    `${plural(c.received, "message")} came in ${period}: Scotty replied to ${c.auto}, held ${c.held} for you, and you sent ${c.you}.`,
    `${plural(c.new_leads, "new enquiry", "new enquiries")}. Discovery found ${plural(c.discovered, "business", "businesses")} without a website and qualified ${c.qualified}.`,
    "",
  ];
  if (waiting.length) {
    lines.push(`Needs you (${waiting.length}):`);
    for (const t of waiting.slice(0, 8)) lines.push(`• ${t.business_name}: ${t.reason ?? t.preview}`);
  } else {
    lines.push("Nothing needs you.");
  }
  if (calls.length) {
    lines.push("", "Top businesses to call:");
    for (const l of calls) lines.push(`• ${l.business_name}${l.phone ? `, ${l.phone}` : ""}${l.reason ? `: ${l.reason}` : ""}`);
  }
  if (weekly) {
    const pipeline = await q<{ status: string; n: number }>("SELECT status, count(*)::int AS n FROM scotty.leads WHERE user_id = $1::uuid GROUP BY status ORDER BY n DESC", [op.id]);
    lines.push("", `Pipeline: ${pipeline.map((p) => `${p.status.replace(/_/g, " ")} ${p.n}`).join(", ") || "empty"}`);
  }

  const link = appUrl();
  await sendMail({
    to: studioInboxes(),
    subject: `${weekly ? "Scotty weekly" : "Scotty daily"}: ${waiting.length ? `${waiting.length} need you` : "nothing needs you"}, ${c.received} in, ${c.qualified} to call`,
    text: `${lines.join("\n")}\n\nOpen Scotty: ${link}`,
    html: `${textToHtml(lines.join("\n"))}<p><a href="${escapeHtml(link)}">Open Scotty</a></p>`,
  });
  return json({ sent: true, weekly, needs_you: waiting.length });
}
