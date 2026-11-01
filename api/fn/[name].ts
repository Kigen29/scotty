import { currentOperator, json } from "../_lib/session.js";

/**
 * The endpoint behind the frontend's `supabase.functions.invoke(name)`. The old Deno edge functions
 * are being rebuilt here one at a time; until a function exists, the call fails with a clear message
 * instead of silently doing nothing. Nothing here sends email or messages yet.
 */
const handlers: Record<string, (body: unknown, operatorId: string) => Promise<unknown>> = {};

export async function POST(req: Request) {
  const op = currentOperator(req);
  if (!op) return json({ data: null, error: { message: "Not signed in." } }, 401);

  const name = new URL(req.url).pathname.split("/").pop() ?? "";
  const handler = handlers[name];
  if (!handler) {
    return json({ data: null, error: { message: `"${name}" is being rebuilt on the new backend and isn't available yet.` } }, 501);
  }
  try {
    return json({ data: await handler(await req.json().catch(() => ({})), op.id), error: null });
  } catch (err) {
    console.error(`fn ${name}:`, err);
    return json({ data: null, error: { message: err instanceof Error ? err.message : "Function failed." } }, 500);
  }
}
