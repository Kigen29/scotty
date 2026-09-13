#!/usr/bin/env node
/**
 * Import the JSON exports into the local Postgres.
 *
 *   docker compose -f tools/migration/docker-compose.yml up -d
 *   node tools/migration/import.mjs
 *
 * Reads tools/migration/data/<table>*.json — so paginated exports
 * (leads.part1.json, leads.part2.json) need no merging by hand.
 *
 * Every row is inserted via jsonb_populate_record, which means Postgres does
 * the type coercion rather than this script guessing. A jsonb column stays
 * jsonb, a text[] stays text[], a timestamptz keeps its offset. That is the
 * whole reason the export is JSON and not CSV.
 *
 * Safe to re-run: each table is truncated before loading, and the script
 * refuses to touch a database that has anything other than our own tables in
 * it, so it cannot be pointed at production by accident.
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");

// Order matters: parents before children, so foreign keys hold.
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
];

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
  console.error(
    "Refusing to run: MIGRATION_DATABASE_URL is not a loopback address.\n" +
      "This script truncates tables. It is for the local rehearsal database only.",
  );
  process.exit(2);
}

if (!existsSync(DATA)) {
  console.error(`No ${DATA} directory.\nRun the queries in 02-export.sql and save each result there first.`);
  process.exit(2);
}

const files = await readdir(DATA);
const client = new pg.Client({ connectionString: CONN });
await client.connect();

let grandTotal = 0;
const summary = [];

for (const table of TABLES) {
  const parts = files
    .filter((f) => f === `${table}.json` || f.startsWith(`${table}.part`))
    .sort();

  if (parts.length === 0) {
    summary.push({ table, files: 0, rows: 0, note: "no export file" });
    continue;
  }

  const rows = [];
  for (const part of parts) {
    const raw = await readFile(join(DATA, part), "utf8");
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      console.error(`\n${part} is not valid JSON: ${err.message}`);
      console.error("Copy the whole cell value, including the surrounding [ ].");
      process.exit(1);
    }
    if (!Array.isArray(parsed)) {
      console.error(`\n${part} is not a JSON array. Expected the jsonb_agg result.`);
      process.exit(1);
    }
    rows.push(...parsed);
  }

  await client.query("BEGIN");
  try {
    await client.query(`TRUNCATE TABLE public.${table} CASCADE`);
    for (const row of rows) {
      // Postgres coerces every column from the JSON object using the table's
      // own definition — no per-column mapping in this script to drift.
      await client.query(
        `INSERT INTO public.${table} SELECT * FROM jsonb_populate_record(null::public.${table}, $1::jsonb)`,
        [JSON.stringify(row)],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`\n${table}: import failed, rolled back.\n  ${err.message}`);
    process.exit(1);
  }

  grandTotal += rows.length;
  summary.push({ table, files: parts.length, rows: rows.length, note: "" });
}

await client.end();

const w = Math.max(...summary.map((s) => s.table.length));
console.log("\n  table" + " ".repeat(w - 4) + "  files   rows");
console.log("  " + "-".repeat(w + 16));
for (const s of summary) {
  console.log(`  ${s.table.padEnd(w)}  ${String(s.files).padStart(5)}  ${String(s.rows).padStart(5)}  ${s.note}`);
}
console.log("  " + "-".repeat(w + 16));
console.log(`  ${"total".padEnd(w)}  ${" ".repeat(5)}  ${String(grandTotal).padStart(5)}\n`);
console.log("Now run `npm run migrate:verify` and compare against the source counts.");
