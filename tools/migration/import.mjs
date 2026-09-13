#!/usr/bin/env node
/**
 * Import the exported rows into the local Postgres.
 *
 *   npm run migrate:up
 *   npm run migrate:schema
 *   npm run migrate:import
 *
 * Reads tools/migration/data/<table>.csv — the CSV export of the base64 blocks
 * in 02-export.sql. Each data line is one base64-encoded JSON object.
 *
 * Rows are inserted with jsonb_populate_record, so Postgres coerces every
 * column from its own definition. A jsonb column stays jsonb, a text[] stays
 * text[], a timestamptz keeps its offset. There is no per-column mapping here
 * that could drift from the schema.
 *
 * Safe to re-run: each table is truncated first, and the script refuses any
 * non-loopback address, so it cannot be pointed at production by accident.
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");

// Parents before children, so foreign keys hold.
const TABLES = [
  "profiles",
  "settings",
  "icp_profiles",
  "leads",
  "sequences",
  "sequence_templates",
  "ab_tests",
  "email_campaigns",
  "conversations",
  "meetings",
  "sequence_enrollments",
  "activity_logs",
];

const CONN =
  process.env.MIGRATION_DATABASE_URL ??
  "postgres://scotty:scotty_local_dev@127.0.0.1:54329/scotty";

const isLocal = (url) => {
  try {
    const h = new URL(url).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "::1";
  } catch {
    return false;
  }
};

if (!isLocal(CONN)) {
  console.error(
    "Refusing to run: MIGRATION_DATABASE_URL is not a loopback address.\n" +
      "This script truncates tables. Local rehearsal database only.",
  );
  process.exit(2);
}
if (!existsSync(DATA)) {
  console.error(`No ${DATA}.\nRun the blocks in 02-export.sql and save each CSV there first.`);
  process.exit(2);
}

/**
 * Pull the base64 payloads out of an exported CSV.
 *
 * The file is one column, so there is nothing to split on. Anything that is
 * not base64 is a header, a blank line, or an exporter's stray quoting — all
 * of which are dropped rather than guessed at, because a malformed line here
 * means an incomplete import and we would rather fail loudly than quietly.
 */
function payloads(text) {
  const out = [];
  const bad = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^"+|"+$/g, "").trim();
    if (!line) continue;
    if (line === "row_b64") continue; // header
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(line)) out.push(line);
    else bad.push(line.slice(0, 40));
  }
  return { out, bad };
}

const files = await readdir(DATA);
const client = new pg.Client({ connectionString: CONN });
await client.connect();

const summary = [];
let grand = 0;

for (const table of TABLES) {
  const file = files.find((f) => f.toLowerCase() === `${table}.csv`);
  if (!file) {
    summary.push({ table, rows: 0, note: "no export file" });
    continue;
  }

  const { out, bad } = payloads(await readFile(join(DATA, file), "utf8"));
  if (bad.length) {
    console.error(`\n${file}: ${bad.length} line(s) are not base64. First: ${bad[0]}`);
    console.error("Re-export this table — the file looks truncated or re-encoded.");
    await client.end();
    process.exit(1);
  }

  const rows = [];
  for (const [i, b64] of out.entries()) {
    let obj;
    try {
      obj = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    } catch (err) {
      console.error(`\n${file}: line ${i + 1} did not decode to JSON — ${err.message}`);
      await client.end();
      process.exit(1);
    }
    rows.push(obj);
  }

  await client.query("BEGIN");
  try {
    await client.query(`TRUNCATE TABLE public.${table} CASCADE`);
    for (const row of rows) {
      await client.query(
        `INSERT INTO public.${table}
         SELECT * FROM jsonb_populate_record(null::public.${table}, $1::jsonb)`,
        [JSON.stringify(row)],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`\n${table}: import failed, rolled back.\n  ${err.message}`);
    await client.end();
    process.exit(1);
  }

  grand += rows.length;
  summary.push({ table, rows: rows.length, note: "" });
}

await client.end();

const w = Math.max(...summary.map((s) => s.table.length));
console.log("\n  table" + " ".repeat(w - 4) + "   rows");
console.log("  " + "-".repeat(w + 18));
for (const s of summary) {
  console.log(`  ${s.table.padEnd(w)}  ${String(s.rows).padStart(5)}  ${s.note}`);
}
console.log("  " + "-".repeat(w + 18));
console.log(`  ${"total".padEnd(w)}  ${String(grand).padStart(5)}\n`);
console.log("Now `npm run migrate:verify`, and compare against the counts from 02-export.sql.");
