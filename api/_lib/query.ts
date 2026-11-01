/**
 * Translates the frontend's Supabase-style query calls into parameterised SQL against the
 * `scotty` schema in Neon.
 *
 * This replaces PostgREST + row-level security. The rules that used to live in RLS live here:
 *   - only tables and columns that exist in the schema can be named; everything else is refused
 *   - every value is a bound parameter, never spliced into SQL
 *   - every statement is pinned to the operator's user id, on read and on write
 */

export type Schema = Map<string, Map<string, string>>; // table -> column -> udt_name

export type Filter = { column: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is"; value: unknown; negate?: boolean };

export type QueryRequest = {
  table: string;
  action: "select" | "insert" | "update" | "upsert" | "delete";
  /** Supabase select string, e.g. "*, leads(business_name)". For writes: what to return, or null. */
  columns: string | null;
  filters?: Filter[];
  order?: { column: string; ascending: boolean }[];
  limit?: number;
  count?: "exact";
  head?: boolean;
  values?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
};

export type Embed = { name: string; column: string; target: string; columns: string[] | "*" };

export type Plan = { text: string; values: unknown[]; embeds: Embed[]; countOnly: boolean };

export class QueryError extends Error {}

/** Many-to-one joins the frontend asks for, keyed by the name used in the select string. */
const EMBEDS: Record<string, Record<string, { column: string; target: string }>> = {
  email_campaigns: { leads: { column: "lead_id", target: "leads" } },
  conversations: { leads: { column: "lead_id", target: "leads" } },
  meetings: { leads: { column: "lead_id", target: "leads" } },
  sequence_enrollments: {
    leads: { column: "lead_id", target: "leads" },
    sequences: { column: "sequence_id", target: "sequences" },
  },
  ab_tests: {
    leads: { column: "lead_id", target: "leads" },
    ab_tests_campaign_a_id_fkey: { column: "campaign_a_id", target: "email_campaigns" },
    ab_tests_campaign_b_id_fkey: { column: "campaign_b_id", target: "email_campaigns" },
  },
  activity_logs: { profiles: { column: "user_id", target: "profiles" } },
  agent_events: {
    leads: { column: "lead_id", target: "leads" },
    conversations: { column: "conversation_id", target: "conversations" },
  },
  team_members: { profiles: { column: "user_id", target: "profiles" } },
};

/** The column that says who owns a row. */
export const ownerColumn = (table: string) => (table === "profiles" ? "id" : table === "teams" ? "created_by" : "user_id");

const ident = (s: string) => `"${s}"`;

function castFor(udt: string) {
  if (udt.startsWith("_")) return `${udt.slice(1)}[]`;
  return udt;
}

/** JSON columns are sent as text and cast; Postgres arrays and scalars go through as-is. */
function encode(udt: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (udt === "json" || udt === "jsonb") return JSON.stringify(value);
  return value;
}

/** Splits "a, b(c, d), e" on top-level commas. */
function splitTopLevel(s: string) {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function parseSelect(table: string, select: string, schema: Schema) {
  const cols = tableColumns(table, schema);
  const base: string[] = [];
  const embeds: Embed[] = [];
  for (const part of splitTopLevel(select || "*")) {
    const m = part.match(/^(?:(\w+):)?(\w+)(?:!(\w+))?\((.*)\)$/s);
    if (m) {
      const [, alias, name, hint, inner] = m;
      const rel = EMBEDS[table]?.[hint ?? name] ?? EMBEDS[table]?.[name];
      if (!rel) throw new QueryError(`Unknown relation "${name}" on ${table}.`);
      const targetCols = tableColumns(rel.target, schema);
      const wanted = splitTopLevel(inner);
      const list = wanted.includes("*") ? "*" : wanted;
      if (list !== "*") for (const c of list) if (!targetCols.has(c)) throw new QueryError(`Unknown column ${rel.target}.${c}.`);
      embeds.push({ name: alias ?? name, column: rel.column, target: rel.target, columns: list });
      if (!base.includes(rel.column) && !base.includes("*")) base.push(rel.column);
    } else if (part === "*") {
      base.splice(0, base.length, "*");
    } else {
      if (!cols.has(part)) throw new QueryError(`Unknown column ${table}.${part}.`);
      if (!base.includes("*") && !base.includes(part)) base.push(part);
    }
  }
  return { base: base.length ? base : ["*"], embeds };
}

function tableColumns(table: string, schema: Schema) {
  const cols = schema.get(table);
  if (!cols) throw new QueryError(`Unknown table "${table}".`);
  return cols;
}

export function plan(req: QueryRequest, schema: Schema, operatorId: string): Plan {
  const cols = tableColumns(req.table, schema);
  const owner = ownerColumn(req.table);
  const values: unknown[] = [];
  const param = (column: string, value: unknown) => {
    const udt = cols.get(column);
    if (!udt) throw new QueryError(`Unknown column ${req.table}.${column}.`);
    values.push(encode(udt, value));
    return `$${values.length}::${castFor(udt)}`;
  };
  const table = `scotty.${ident(req.table)}`;

  // Built on demand so parameter numbers follow the order they appear in the statement.
  const buildWhere = () => {
    const where = [`${ident(owner)} = ${param(owner, operatorId)}`];
    for (const f of req.filters ?? []) {
      if (!cols.has(f.column)) throw new QueryError(`Unknown column ${req.table}.${f.column}.`);
      const c = ident(f.column);
      if (f.op === "is") {
        if (f.value !== null) throw new QueryError("Only `is null` is supported.");
        where.push(`${c} IS ${f.negate ? "NOT " : ""}NULL`);
      } else if (f.op === "in") {
        if (!Array.isArray(f.value)) throw new QueryError("`in` needs a list.");
        if (!f.value.length) where.push("false");
        else where.push(`${c} IN (${f.value.map((v) => param(f.column, v)).join(", ")})`);
      } else {
        const sqlOp = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[f.op];
        if (!sqlOp) throw new QueryError(`Unsupported filter ${f.op}.`);
        where.push(`${f.negate ? "NOT " : ""}${c} ${sqlOp} ${param(f.column, f.value)}`);
      }
    }
    return ` WHERE ${where.join(" AND ")}`;
  };

  const returning = () => {
    if (req.columns == null) return { sql: "", embeds: [] as Embed[] };
    const { base, embeds } = parseSelect(req.table, req.columns, schema);
    return { sql: ` RETURNING ${base.map((c) => (c === "*" ? "*" : ident(c))).join(", ")}`, embeds };
  };

  switch (req.action) {
    case "select": {
      if (req.count === "exact" && req.head) {
        return { text: `SELECT count(*)::int AS count FROM ${table}${buildWhere()}`, values, embeds: [], countOnly: true };
      }
      const { base, embeds } = parseSelect(req.table, req.columns ?? "*", schema);
      let text = `SELECT ${base.map((c) => (c === "*" ? "*" : ident(c))).join(", ")} FROM ${table}${buildWhere()}`;
      if (req.order?.length) {
        for (const o of req.order) if (!cols.has(o.column)) throw new QueryError(`Unknown column ${req.table}.${o.column}.`);
        text += ` ORDER BY ${req.order.map((o) => `${ident(o.column)} ${o.ascending ? "ASC" : "DESC"} NULLS LAST`).join(", ")}`;
      }
      if (req.limit != null) text += ` LIMIT ${Math.max(0, Math.min(Math.floor(Number(req.limit)), 5000))}`;
      return { text, values, embeds, countOnly: false };
    }

    case "insert":
    case "upsert": {
      const rows = Array.isArray(req.values) ? req.values : [req.values ?? {}];
      if (!rows.length) throw new QueryError("Nothing to insert.");
      // The owner is always the operator, whatever the client sent.
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r)).filter((k) => k !== owner)), owner];
      const tuples = rows.map((r) => `(${keys.map((k) => (k === owner ? param(k, operatorId) : k in r ? param(k, r[k]) : "DEFAULT")).join(", ")})`);
      let text = `INSERT INTO ${table} (${keys.map(ident).join(", ")}) VALUES ${tuples.join(", ")}`;
      if (req.action === "upsert") {
        const target = (req.onConflict ?? "id").split(",").map((s) => s.trim());
        for (const t of target) if (!cols.has(t)) throw new QueryError(`Unknown column ${req.table}.${t}.`);
        const updates = keys.filter((k) => !target.includes(k) && k !== owner);
        text += ` ON CONFLICT (${target.map(ident).join(", ")}) DO ${
          updates.length ? `UPDATE SET ${updates.map((k) => `${ident(k)} = EXCLUDED.${ident(k)}`).join(", ")}` : "NOTHING"
        }`;
        // Never let an upsert take over a row that belongs to someone else.
        if (updates.length) text += ` WHERE ${table}.${ident(owner)} = EXCLUDED.${ident(owner)}`;
      }
      const r = returning();
      return { text: text + r.sql, values, embeds: r.embeds, countOnly: false };
    }

    case "update": {
      const set = Object.entries((req.values as Record<string, unknown>) ?? {}).filter(([k]) => k !== owner);
      if (!set.length) throw new QueryError("Nothing to update.");
      if (!(req.filters ?? []).length) throw new QueryError("Refusing to update without a filter.");
      const assignments = set.map(([k, v]) => `${ident(k)} = ${param(k, v)}`).join(", ");
      const whereSql = buildWhere();
      const r = returning();
      return { text: `UPDATE ${table} SET ${assignments}${whereSql}${r.sql}`, values, embeds: r.embeds, countOnly: false };
    }

    case "delete": {
      if (!(req.filters ?? []).length) throw new QueryError("Refusing to delete without a filter.");
      const whereSql = buildWhere();
      const r = returning();
      return { text: `DELETE FROM ${table}${whereSql}${r.sql}`, values, embeds: r.embeds, countOnly: false };
    }
  }
  throw new QueryError(`Unsupported action ${(req as QueryRequest).action}.`);
}
