/**
 * Scotty's data client. It keeps the subset of the supabase-js API the screens use
 * (`from().select().eq()...`, `functions.invoke`, `auth.*`) so they didn't need rewriting
 * when the backend moved off Supabase to Neon. Every call goes to Scotty's own API:
 *
 *   from(...)         POST /api/db      (see api/_lib/query.ts)
 *   functions.invoke  POST /api/fn/:name
 *   auth.*            /api/auth
 *
 * Realtime is gone; `channel()` is a no-op and screens refresh when they load or act.
 */

export type User = { id: string; email: string };
type Session = { user: User } | null;
type ApiError = { message: string; code?: string };
// Screens were written against untyped supabase results; keep that contract here, in one place.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = any;
type Response = { data: Data; error: ApiError | null; count?: number | null };

type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is";

async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({ error: { message: `Request failed (${res.status}).` } }))) as Record<string, unknown>;
    return { status: res.status, json };
  } catch {
    return { status: 0, json: { data: null, error: { message: "Can't reach the server. Check your connection." } } };
  }
}

class Query implements PromiseLike<Response> {
  private req: Record<string, unknown>;
  private filters: { column: string; op: FilterOp; value: unknown; negate?: boolean }[] = [];
  private orders: { column: string; ascending: boolean }[] = [];

  constructor(table: string) {
    this.req = { table, action: "select", columns: "*" };
  }

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    // After insert/update/upsert/delete, select() says what to return.
    this.req.columns = columns;
    if (opts?.count) this.req.count = opts.count;
    if (opts?.head) this.req.head = true;
    return this;
  }
  insert(values: object | object[]) {
    return this.write("insert", values);
  }
  update(values: object) {
    return this.write("update", values);
  }
  upsert(values: object | object[], opts?: { onConflict?: string }) {
    if (opts?.onConflict) this.req.onConflict = opts.onConflict;
    return this.write("upsert", values);
  }
  delete() {
    return this.write("delete");
  }
  private write(action: string, values?: unknown) {
    this.req.action = action;
    this.req.values = values;
    this.req.columns = null;
    return this;
  }

  private filter(column: string, op: FilterOp, value: unknown, negate = false) {
    this.filters.push({ column, op, value, negate });
    return this;
  }
  eq(c: string, v: unknown) { return this.filter(c, "eq", v); }
  neq(c: string, v: unknown) { return this.filter(c, "neq", v); }
  gt(c: string, v: unknown) { return this.filter(c, "gt", v); }
  gte(c: string, v: unknown) { return this.filter(c, "gte", v); }
  lt(c: string, v: unknown) { return this.filter(c, "lt", v); }
  lte(c: string, v: unknown) { return this.filter(c, "lte", v); }
  in(c: string, v: unknown[]) { return this.filter(c, "in", v); }
  is(c: string, v: null) { return this.filter(c, "is", v); }
  not(c: string, op: FilterOp, v: unknown) { return this.filter(c, op, v, true); }
  match(obj: Record<string, unknown>) {
    for (const [c, v] of Object.entries(obj)) this.eq(c, v);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: opts?.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.req.limit = n;
    return this;
  }
  single() {
    this.req.single = "one";
    return this;
  }
  maybeSingle() {
    this.req.single = "maybe";
    return this;
  }

  private async run(): Promise<Response> {
    const { json } = await post("/api/db", { ...this.req, filters: this.filters, order: this.orders });
    return { data: json.data ?? null, error: (json.error as ApiError) ?? null, count: (json.count as number) ?? null };
  }

  then<A = Response, B = never>(onfulfilled?: ((v: Response) => A | PromiseLike<A>) | null, onrejected?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(onfulfilled, onrejected);
  }
}

type AuthListener = (event: "SIGNED_IN" | "SIGNED_OUT" | "INITIAL_SESSION", session: Session) => void;
const listeners = new Set<AuthListener>();
const emit = (event: Parameters<AuthListener>[0], session: Session) => listeners.forEach((l) => l(event, session));

const auth = {
  async getSession(): Promise<{ data: { session: Session }; error: null }> {
    try {
      const res = await fetch("/api/auth", { credentials: "same-origin", cache: "no-store" });
      const { user } = (await res.json()) as { user: User | null };
      return { data: { session: user ? { user } : null }, error: null };
    } catch {
      return { data: { session: null }, error: null };
    }
  },
  onAuthStateChange(cb: AuthListener) {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => void listeners.delete(cb) } } };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const { json } = await post("/api/auth", { action: "login", email, password });
    if (json.error) return { data: { user: null, session: null }, error: json.error as ApiError };
    const session = { user: json.user as User };
    emit("SIGNED_IN", session);
    return { data: { user: session.user, session }, error: null };
  },
  async signUp(_: { email: string; password: string }) {
    return { data: { user: null, session: null }, error: { message: "Scotty has a single operator; sign-ups are closed." } };
  },
  async signOut() {
    await post("/api/auth", { action: "logout" });
    emit("SIGNED_OUT", null);
    return { error: null };
  },
};

type Channel = { on: (...args: unknown[]) => Channel; subscribe: () => Channel };
const channelStub: Channel = {
  on: () => channelStub,
  subscribe: () => channelStub,
};

export const supabase = {
  from: (table: string) => new Query(table),
  auth,
  functions: {
    async invoke(name: string, opts?: { body?: unknown }): Promise<{ data: Data; error: ApiError | null }> {
      const { json } = await post(`/api/fn/${encodeURIComponent(name)}`, opts?.body ?? {});
      return { data: json.data ?? null, error: (json.error as ApiError) ?? null };
    },
  },
  channel: (_name: string) => channelStub,
  removeChannel: (_channel: unknown) => undefined,
};
