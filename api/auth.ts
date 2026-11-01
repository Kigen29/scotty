import { checkLogin, clearCookie, currentOperator, json, sessionCookie } from "./_lib/session.js";

/** GET: the current session. POST {action: "login", email, password} or {action: "logout"}. */
export function GET(req: Request) {
  const op = currentOperator(req);
  return json({ user: op ? { id: op.id, email: op.email } : null });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; email?: string; password?: string };

  if (body.action === "logout") return json({ ok: true }, 200, { "set-cookie": clearCookie() });

  if (body.action === "login") {
    const op = checkLogin(String(body.email ?? ""), String(body.password ?? ""));
    if (!op) return json({ error: { message: "Invalid email or password." } }, 401);
    return json({ user: { id: op.id, email: op.email } }, 200, { "set-cookie": sessionCookie() });
  }

  return json({ error: { message: "Unknown action." } }, 400);
}
