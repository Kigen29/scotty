#!/usr/bin/env node
/**
 * Verify the imported copy against the source.
 *
 *   node tools/migration/verify.mjs
 *
 * Counting rows is not enough. A CSV migration can produce the right row count
 * with a truncated jsonb field, and you would not find out until the agent
 * behaved strangely months later. So this also checks the columns most likely
 * to have been mangled in transit, and prints a fingerprint you can compare
 * against the same query run on the source.
 *
 * Paste the printed source query into the Lovable SQL editor and compare the
 * two outputs line by line. They must match exactly.
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const CONN =
  process.env.MIGRATION_DATABASE_URL ??
  "postgres://scotty:scotty_local_dev@127.0.0.1:54329/scotty";

/**
 * Row counts from the source, taken with the counts query at the bottom of
 * 02-export.sql on 13 September 2026.
 *
 * These live here so the check is automatic. Comparing two printed tables by
 * eye is exactly the kind of step that gets skimmed at cutover, which is when
 * it matters most — a table that exported short still prints a plausible
 * number, and only a comparison catches it.
 *
 * Re-run the counts query and update these before the cutover export; the
 * source will have moved on.
 */
const SOURCE_COUNTS = {
  ab_tests: 0,
  activity_logs: 456,
  conversations: 0,
  email_campaigns: 337,
  icp_profiles: 1,
  leads: 410,
  meetings: 0,
  profiles: 1,
  sequence_enrollments: 0,
  sequence_templates: 1,
  sequences: 1,
  settings: 1,
};

// The fingerprint query. Runs identically on both databases.
//
// Beyond row counts it checks: the jsonb columns are still objects rather than
// strings, the text[] arrays still have their elements, and the longest email
// body survived intact — that last one is where embedded newlines would have
// broken a CSV import.
const FINGERPRINT = `
SELECT 'leads'                AS t, count(*)::text AS rows,
       count(*) FILTER (WHERE analysis IS NOT NULL)::text        AS jsonb_present,
       count(*) FILTER (WHERE jsonb_typeof(analysis) = 'object')::text AS jsonb_objects,
       coalesce(max(length(business_name)), 0)::text             AS max_text
FROM   public.leads
UNION ALL
SELECT 'email_campaigns', count(*)::text,
       count(*) FILTER (WHERE body IS NOT NULL)::text,
       count(*) FILTER (WHERE body LIKE '%' || chr(10) || '%')::text,
       coalesce(max(length(body)), 0)::text
FROM   public.email_campaigns
UNION ALL
SELECT 'settings', count(*)::text,
       coalesce(sum(coalesce(array_length(services, 1), 0)), 0)::text,
       coalesce(sum(coalesce(array_length(target_categories, 1), 0)), 0)::text,
       coalesce(sum(coalesce(array_length(target_locations, 1), 0)), 0)::text
FROM   public.settings
UNION ALL
SELECT 'conversations', count(*)::text, '', '', coalesce(max(length(message)), 0)::text FROM public.conversations
UNION ALL
SELECT 'activity_logs', count(*)::text, '', '', '' FROM public.activity_logs
UNION ALL
SELECT 'sequences', count(*)::text, '', '', '' FROM public.sequences
UNION ALL
SELECT 'sequence_enrollments', count(*)::text, '', '', '' FROM public.sequence_enrollments
UNION ALL
SELECT 'sequence_templates', count(*)::text, '', '', '' FROM public.sequence_templates
UNION ALL
SELECT 'icp_profiles', count(*)::text, '', '', '' FROM public.icp_profiles
UNION ALL
SELECT 'profiles', count(*)::text, '', '', '' FROM public.profiles
UNION ALL
SELECT 'meetings', count(*)::text, '', '', '' FROM public.meetings
UNION ALL
SELECT 'ab_tests', count(*)::text, '', '', '' FROM public.ab_tests
ORDER BY 1;
`;

const client = new pg.Client({ connectionString: CONN });
await client.connect();
const { rows } = await client.query(FINGERPRINT);
await client.end();

const cols = ["t", "rows", "jsonb_present", "jsonb_objects", "max_text"];
const head = ["table", "rows", "source", "", "col_a", "col_b", "max_len"];

const lines = rows.map((r) => {
  const local = Number(r.rows);
  const src = SOURCE_COUNTS[r.t];
  const known = src !== undefined;
  const verdict = !known ? "?" : local === src ? "ok" : local === 0 ? "MISSING" : "MISMATCH";
  return [r.t, String(local), known ? String(src) : "-", verdict,
          String(r.jsonb_present ?? ""), String(r.jsonb_objects ?? ""), String(r.max_text ?? "")];
});

const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
console.log("");
console.log("  LOCAL COPY vs SOURCE");
console.log("");
console.log("  " + head.map((h, i) => h.padEnd(widths[i])).join("  "));
console.log("  " + widths.map((w) => "-".repeat(w)).join("  "));
for (const l of lines) console.log("  " + l.map((c, i) => c.padEnd(widths[i])).join("  "));

const missing = lines.filter((l) => l[3] === "MISSING").map((l) => l[0]);
const wrong = lines.filter((l) => l[3] === "MISMATCH").map((l) => l[0]);

console.log("");
if (wrong.length) {
  console.log(`  MISMATCH on ${wrong.join(", ")} — the export is short. Re-export before trusting it.`);
  process.exitCode = 1;
} else if (missing.length) {
  console.log(`  Not yet imported: ${missing.join(", ")}`);
  console.log("  Export those blocks from 02-export.sql and re-run migrate:import.");
  process.exitCode = 1;
} else {
  console.log("  Every table matches the source count.");
}

console.log(`
  Row counts are necessary, not sufficient. col_a/col_b/max_len above check that
  jsonb stayed an object, arrays kept their elements, and the longest body
  survived — which is where a mangled import would actually show.
`);
