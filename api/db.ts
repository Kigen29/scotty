import { QueryError, runQuery } from "./_lib/db.js";
import { currentOperator, json } from "./_lib/session.js";
import type { QueryRequest } from "./_lib/query.js";

/** The data endpoint behind the frontend's `supabase.from(...)` calls. See _lib/query.ts. */
export async function POST(req: Request) {
  const op = currentOperator(req);
  if (!op) return json({ data: null, error: { message: "Not signed in." } }, 401);

  let body: QueryRequest & { single?: "one" | "maybe" };
  try {
    body = await req.json();
  } catch {
    return json({ data: null, error: { message: "Invalid JSON." } }, 400);
  }

  try {
    return json(await runQuery(body, op.id));
  } catch (err) {
    if (err instanceof QueryError) return json({ data: null, error: { message: err.message } }, 400);
    const pg = err as { message?: string; code?: string };
    console.error("db:", body.table, body.action, pg.message);
    return json({ data: null, error: { message: pg.message ?? "Database error.", code: pg.code } }, 500);
  }
}
