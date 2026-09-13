#!/usr/bin/env node
/**
 * Build the schema in the local rehearsal database.
 *
 *   npm run migrate:up        # start Postgres
 *   npm run migrate:schema    # this
 *   npm run migrate:import
 *   npm run migrate:verify
 *
 * Applies the repo's 25 migrations in filename order, after stubbing the parts
 * of Supabase a plain Postgres does not have. Those stubs are the same ones
 * CI's migration replay uses and are known to work.
 *
 * This is a REHEARSAL schema, not the eventual one. Phase 2 replaces these
 * migrations with a Drizzle schema that owes nothing to Supabase — no auth
 * schema, no RLS, no pg_cron. The point here is only to have somewhere
 * faithful to restore the export into, so the data can be counted and
 * compared before anyone trusts it.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

const CONN =
  process.env.MIGRATION_DATABASE_URL ??
  "postgres://scotty:scotty_local_dev@127.0.0.1:54329/scotty";

function isLocal(url) {
  try {
    const h = new URL(url).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "::1";
  } catch {
    return false;
  }
}

if (!isLocal(CONN)) {
  console.error("Refusing to run: this drops and rebuilds a schema. Loopback only.");
  process.exit(2);
}

// Enough Supabase for the migrations to apply. RLS policies reference
// auth.uid() and grant to roles that do not exist on a plain image.
const PREFLIGHT = `
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_admin']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  email text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='auth' AND p.proname='uid') THEN
    EXECUTE $f$ CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid' $f$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='auth' AND p.proname='role') THEN
    EXECUTE $f$ CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS 'SELECT NULL::text' $f$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
`;

const client = new pg.Client({ connectionString: CONN });
await client.connect();

console.log("  resetting public schema");
await client.query("DROP SCHEMA IF EXISTS public CASCADE");
await client.query("CREATE SCHEMA public");

console.log("  preflight stubs");
await client.query(PREFLIGHT);

const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
console.log(`  applying ${files.length} migrations`);

let applied = 0;
const skipped = [];
for (const f of files) {
  const sql = await readFile(join(MIGRATIONS, f), "utf8");
  try {
    await client.query(sql);
    applied++;
  } catch (err) {
    // pg_cron and pg_net are not available on a plain image. Those migrations
    // are infrastructure, not schema, and the rehearsal does not need them.
    if (/extension "(pg_cron|pg_net)" is not available/.test(err.message)) {
      skipped.push({ f, why: "needs a Supabase-only extension" });
      continue;
    }
    console.error(`\n  ${f}\n    ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

const { rows } = await client.query(`
  SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
`);
await client.end();

console.log(`  applied ${applied}, skipped ${skipped.length}`);
for (const s of skipped) console.log(`      skipped ${s.f} — ${s.why}`);
console.log(`\n  tables now present (${rows.length}):`);
for (const r of rows) console.log(`      ${r.tablename}`);
console.log("\n  Next: save the exports into tools/migration/data/, then `npm run migrate:import`.");
