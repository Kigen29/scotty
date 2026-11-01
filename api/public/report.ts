import { publicReport, reportViewed } from "../_lib/outreach.js";

/**
 * The free report shown at code5developers.com/r/<token>. Public by design: the unguessable token is the access
 * control, and the response holds only what the business itself is meant to see.
 *
 *   GET  /api/public/report?token=…   the report (the website renders it server-side)
 *   POST /api/public/report?token=…   "opened", sent by the page in the visitor's browser
 *
 * Opens are counted from the browser, not the server render, so WhatsApp's link preview doesn't count as a view.
 */

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://code5developers.com";
const cors = { "access-control-allow-origin": ORIGIN, "access-control-allow-methods": "GET, POST, OPTIONS", vary: "origin" };

const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors, ...extra } });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const report = await publicReport(token);
  if (!report) return reply({ error: "Not found" }, 404);
  return reply(report, 200, { "cache-control": "no-store", "x-robots-tag": "noindex" });
}

export async function POST(req: Request) {
  await reportViewed(new URL(req.url).searchParams.get("token") ?? "");
  return reply({ ok: true });
}
