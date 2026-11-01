import { sendReply, sortConversation } from "../_lib/inbox.js";
import { overview, threads } from "../_lib/views.js";
import { discover, placesRequestsThisMonth } from "../_lib/discovery.js";
import { currentOperator, json } from "../_lib/session.js";

/**
 * The endpoint behind the frontend's `supabase.functions.invoke(name)`. The old Deno edge functions
 * are being rebuilt here one at a time; until a function exists, the call fails with a clear message
 * instead of silently doing nothing.
 */
type Body = Record<string, unknown>;
const handlers: Record<string, (body: Body, operatorId: string) => Promise<unknown>> = {
  // Emails a reply to someone who wrote to us first. See canReply() in _lib/inbox.ts.
  "send-reply": (b, op) => sendReply({ lead_id: String(b.lead_id ?? ""), message: String(b.message ?? ""), subject: b.subject ? String(b.subject) : undefined }, op),
  // Re-runs Claude on an inbound message whose first sort failed.
  "sort-conversation": (b, op) => sortConversation(String(b.conversation_id ?? ""), op),
  // Google Places discovery, and how much of this month's free allowance is left.
  "discover-leads": (b, op) => discover({ category: b.category as string, location: b.location as string, query: b.query as string, pages: b.pages as number }, op),
  "discovery-usage": async (_b, op) => ({ used: await placesRequestsThisMonth(op), limit: Number(process.env.PLACES_MONTHLY_LIMIT ?? 900), configured: Boolean(process.env.GOOGLE_PLACES_API_KEY) }),
  // Read models for the Inbox and Home screens.
  threads: (_b, op) => threads(op),
  overview: (_b, op) => overview(op),
};

export async function POST(req: Request) {
  const op = currentOperator(req);
  if (!op) return json({ data: null, error: { message: "Not signed in." } }, 401);

  const name = new URL(req.url).pathname.split("/").pop() ?? "";
  const handler = handlers[name];
  if (!handler) {
    return json({ data: null, error: { message: `"${name}" is being rebuilt on the new backend and isn't available yet.` } }, 501);
  }
  try {
    return json({ data: await handler((await req.json().catch(() => ({}))) as Body, op.id), error: null });
  } catch (err) {
    console.error(`fn ${name}:`, err);
    return json({ data: null, error: { message: err instanceof Error ? err.message : "Function failed." } }, 500);
  }
}
