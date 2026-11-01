import { neon } from "@neondatabase/serverless";
import { ownerColumn, plan, QueryError, type QueryRequest, type Schema } from "./query.js";

/** Tables the app may not touch through the generic endpoint. */
const HIDDEN = new Set<string>([]);

let client: ReturnType<typeof neon> | undefined;
let schemaCache: Promise<Schema> | undefined;

export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  client ??= neon(url);
  return client;
}

/** The scotty schema's tables and columns, read once per server instance. */
export function loadSchema(): Promise<Schema> {
  schemaCache ??= (async () => {
    const rows = (await sql().query(
      "SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE table_schema = 'scotty' ORDER BY table_name, ordinal_position",
    )) as { table_name: string; column_name: string; udt_name: string }[];
    const schema: Schema = new Map();
    for (const r of rows) {
      if (HIDDEN.has(r.table_name)) continue;
      if (!schema.has(r.table_name)) schema.set(r.table_name, new Map());
      schema.get(r.table_name)!.set(r.column_name, r.udt_name);
    }
    return schema;
  })().catch((err) => {
    schemaCache = undefined;
    throw err;
  });
  return schemaCache;
}

type Row = Record<string, unknown>;

export type Result = { data: unknown; count?: number | null; error: { message: string; code?: string } | null };

export async function runQuery(req: QueryRequest & { single?: "one" | "maybe" }, operatorId: string): Promise<Result> {
  const schema = await loadSchema();
  const p = plan(req, schema, operatorId);
  const rows = (await sql().query(p.text, p.values)) as Row[];

  if (p.countOnly) return { data: null, count: Number(rows[0]?.count ?? 0), error: null };

  // Attach many-to-one joins, scoped to the operator like everything else.
  for (const e of p.embeds) {
    const ids = [...new Set(rows.map((r) => r[e.column]).filter((v) => v != null))];
    const byId = new Map<unknown, Row>();
    if (ids.length) {
      const cols = e.columns === "*" ? "*" : ["id", ...e.columns.filter((c) => c !== "id")].map((c) => `"${c}"`).join(", ");
      const owner = ownerColumn(e.target);
      const found = (await sql().query(
        `SELECT ${cols} FROM scotty."${e.target}" WHERE "id" = ANY($1::uuid[]) AND "${owner}" = $2::uuid`,
        [ids, operatorId],
      )) as Row[];
      for (const f of found) {
        const keep = e.columns === "*" ? f : Object.fromEntries(e.columns.map((c) => [c, f[c]]));
        byId.set(f.id, keep);
      }
    }
    for (const r of rows) r[e.name] = r[e.column] == null ? null : (byId.get(r[e.column]) ?? null);
  }

  const wantRows = req.action === "select" || req.columns != null;
  if (!wantRows) return { data: null, error: null };

  if (req.single) {
    if (rows.length > 1) return { data: null, error: { message: "More than one row returned.", code: "PGRST116" } };
    if (!rows.length) {
      return req.single === "maybe" ? { data: null, error: null } : { data: null, error: { message: "No rows found.", code: "PGRST116" } };
    }
    return { data: rows[0], error: null };
  }
  return { data: rows, count: req.count === "exact" ? rows.length : null, error: null };
}

export { QueryError };
