#!/usr/bin/env node
/**
 * Applies db/migrations/*.sql to the Neon database, in filename order, each once.
 * Applied files are recorded in scotty.schema_migrations; a file and its record commit together.
 *
 *   npm run db:migrate          apply what's pending (DATABASE_URL from the environment)
 *   npm run db:migrate -- --dry list what's pending without applying
 *
 * Never edit an applied migration: write a new one.
 */
import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `vercel env pull .env.local` and load it first.");
  process.exit(1);
}
const sql = neon(url);

await sql.query("CREATE TABLE IF NOT EXISTS scotty.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
const applied = new Set((await sql.query("SELECT name FROM scotty.schema_migrations")).map((r) => r.name));

const pending = readdirSync("db/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => !applied.has(f));

if (!pending.length) {
  console.log("Nothing to apply.");
  process.exit(0);
}

for (const file of pending) {
  if (DRY) {
    console.log(`pending  ${file}`);
    continue;
  }
  // Neon's HTTP driver runs one statement per query, so split on statement-ending semicolons.
  // Keep migrations to plain DDL/DML; a function body containing ";\n" would need its own file handling.
  const statements = readFileSync(`db/migrations/${file}`, "utf8")
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  // One transaction per file: the statements and the record land together or not at all.
  await sql.transaction([
    ...statements.map((s) => sql.query(s)),
    sql.query("INSERT INTO scotty.schema_migrations (name) VALUES ($1)", [file]),
  ]);
  console.log(`applied  ${file}`);
}
