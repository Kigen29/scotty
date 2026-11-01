import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Scotty has one operator. They sign in with their email and a password set in the environment;
 * the session is an HMAC-signed, httpOnly cookie.
 *
 * Env:
 *   OPERATOR_USER_ID  the uuid that owns every row in the scotty schema
 *   OPERATOR_EMAIL    the email to sign in with
 *   SCOTTY_PASSWORD   the password
 *   SCOTTY_SECRET     at least 32 random characters; signs the cookie
 */

const COOKIE = "scotty_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export type Operator = { id: string; email: string };

function secret() {
  const s = process.env.SCOTTY_SECRET;
  return s && s.length >= 32 ? s : null;
}

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("hex");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function operator(): Operator | null {
  const id = process.env.OPERATOR_USER_ID;
  const email = process.env.OPERATOR_EMAIL;
  return id && email ? { id, email: email.toLowerCase() } : null;
}

export function checkLogin(email: string, password: string): Operator | null {
  const op = operator();
  const expected = process.env.SCOTTY_PASSWORD;
  if (!op || !expected || !secret()) return null;
  // Compare digests so timing doesn't depend on the attempt's length.
  const passOk = safeEqual(sign(password, "pw"), sign(expected, "pw"));
  const emailOk = safeEqual(sign(email.trim().toLowerCase(), "em"), sign(op.email, "em"));
  return passOk && emailOk ? op : null;
}

export function sessionCookie() {
  const key = secret()!;
  const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${COOKIE}=${expires}.${sign(expires, key)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** The signed-in operator, or null. */
export function currentOperator(req: Request): Operator | null {
  const key = secret();
  const op = operator();
  if (!key || !op) return null;
  const raw = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [expires, mac] = raw.split(".");
  if (!expires || !mac || !safeEqual(mac, sign(expires, key))) return null;
  return Number(expires) > Date.now() / 1000 ? op : null;
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
