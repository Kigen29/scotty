import { describe, expect, it } from "vitest";
import { parseSelect, plan, QueryError, type Schema } from "./query.js";

const OP = "80888dc0-9e85-4d9d-90a2-69f92b489e84";

const schema: Schema = new Map([
  ["leads", new Map([["id", "uuid"], ["user_id", "uuid"], ["business_name", "text"], ["email", "text"], ["status", "text"], ["priority_score", "int4"], ["social_links", "jsonb"], ["created_at", "timestamptz"]])],
  ["email_campaigns", new Map([["id", "uuid"], ["user_id", "uuid"], ["lead_id", "uuid"], ["subject", "text"], ["status", "text"], ["sent_at", "timestamptz"]])],
  ["settings", new Map([["id", "uuid"], ["user_id", "uuid"], ["company_name", "text"], ["services", "_text"], ["portfolio_projects", "jsonb"]])],
  ["profiles", new Map([["id", "uuid"], ["email", "text"], ["display_name", "text"]])],
]);

describe("ownership: every statement is pinned to the operator", () => {
  it("scopes reads by user_id, as the first parameter", () => {
    const p = plan({ table: "leads", action: "select", columns: "*" }, schema, OP);
    expect(p.text).toBe('SELECT * FROM scotty."leads" WHERE "user_id" = $1::uuid');
    expect(p.values).toEqual([OP]);
  });

  it("scopes profiles by id rather than user_id", () => {
    const p = plan({ table: "profiles", action: "select", columns: "display_name" }, schema, OP);
    expect(p.text).toContain('WHERE "id" = $1::uuid');
  });

  it("overrides any user_id the client sends on insert", () => {
    const p = plan({ table: "leads", action: "insert", columns: null, values: { business_name: "A", user_id: "someone-else" } }, schema, OP);
    expect(p.values).toEqual(["A", OP]);
    expect(p.values).not.toContain("someone-else");
  });

  it("never lets an update reassign ownership", () => {
    const p = plan({ table: "leads", action: "update", columns: null, values: { status: "x", user_id: "someone-else" }, filters: [{ column: "id", op: "eq", value: "L1" }] }, schema, OP);
    expect(p.text).toBe('UPDATE scotty."leads" SET "status" = $1::text WHERE "user_id" = $2::uuid AND "id" = $3::uuid');
    expect(p.values).toEqual(["x", OP, "L1"]);
  });

  it("guards upserts so a conflict can't overwrite another owner's row", () => {
    const p = plan({ table: "settings", action: "upsert", columns: null, values: { company_name: "Code 5" }, onConflict: "user_id" }, schema, OP);
    expect(p.text).toContain('ON CONFLICT ("user_id") DO UPDATE SET "company_name" = EXCLUDED."company_name"');
    expect(p.text).toContain('WHERE scotty."settings"."user_id" = EXCLUDED."user_id"');
  });
});

describe("only real tables and columns, only bound values", () => {
  it("refuses unknown tables", () => {
    expect(() => plan({ table: "pg_shadow", action: "select", columns: "*" }, schema, OP)).toThrow(QueryError);
  });

  it("refuses unknown or injected column names in select, filters and order", () => {
    expect(() => plan({ table: "leads", action: "select", columns: "email; drop table leads" }, schema, OP)).toThrow(QueryError);
    expect(() => plan({ table: "leads", action: "select", columns: "*", filters: [{ column: 'id" OR 1=1 --', op: "eq", value: 1 }] }, schema, OP)).toThrow(QueryError);
    expect(() => plan({ table: "leads", action: "select", columns: "*", order: [{ column: "created_at desc; --", ascending: true }] }, schema, OP)).toThrow(QueryError);
  });

  it("passes hostile values as parameters, never as SQL", () => {
    const p = plan({ table: "leads", action: "select", columns: "*", filters: [{ column: "email", op: "eq", value: "x' OR '1'='1" }] }, schema, OP);
    expect(p.text).not.toContain("OR '1'='1");
    expect(p.values).toContain("x' OR '1'='1");
  });

  it("refuses delete and update without a filter", () => {
    expect(() => plan({ table: "leads", action: "delete", columns: null }, schema, OP)).toThrow(/without a filter/);
    expect(() => plan({ table: "leads", action: "update", columns: null, values: { status: "x" } }, schema, OP)).toThrow(/without a filter/);
  });
});

describe("query features the screens use", () => {
  it("supports in, not-is-null, gte, order and limit", () => {
    const p = plan(
      {
        table: "leads",
        action: "select",
        columns: "id, email",
        filters: [
          { column: "status", op: "in", value: ["a", "b"] },
          { column: "email", op: "is", value: null, negate: true },
          { column: "priority_score", op: "gte", value: 5 },
        ],
        order: [{ column: "created_at", ascending: false }],
        limit: 15,
      },
      schema,
      OP,
    );
    expect(p.text).toBe(
      'SELECT "id", "email" FROM scotty."leads" WHERE "user_id" = $1::uuid AND "status" IN ($2::text, $3::text) AND "email" IS NOT NULL AND "priority_score" >= $4::int4 ORDER BY "created_at" DESC NULLS LAST LIMIT 15',
    );
  });

  it("counts without returning rows", () => {
    const p = plan({ table: "email_campaigns", action: "select", columns: "id", count: "exact", head: true }, schema, OP);
    expect(p.countOnly).toBe(true);
    expect(p.text).toContain("count(*)");
  });

  it("parses joins, including aliases and foreign-key hints", () => {
    const { base, embeds } = parseSelect("email_campaigns", "*, leads(business_name, email)", schema);
    expect(base).toEqual(["*"]);
    expect(embeds).toEqual([{ name: "leads", column: "lead_id", target: "leads", columns: ["business_name", "email"] }]);
    const narrow = parseSelect("email_campaigns", "id, leads(*)", schema);
    expect(narrow.base).toEqual(["id", "lead_id"]);
  });

  it("encodes JSON columns as JSON and leaves Postgres arrays alone", () => {
    const p = plan({ table: "settings", action: "insert", columns: "id", values: { services: ["web", "apps"], portfolio_projects: [{ name: "x" }] } }, schema, OP);
    expect(p.values).toEqual([["web", "apps"], '[{"name":"x"}]', OP]);
    expect(p.text).toContain("$1::text[]");
    expect(p.text).toContain("$2::jsonb");
    expect(p.text).toContain('RETURNING "id"');
  });

  it("an empty in-list matches nothing instead of erroring", () => {
    const p = plan({ table: "leads", action: "select", columns: "*", filters: [{ column: "id", op: "in", value: [] }] }, schema, OP);
    expect(p.text).toContain("AND false");
  });
});
