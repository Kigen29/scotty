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
const head = ["table", "rows", "col_a", "col_b", "max_len"];
const widths = cols.map((c, i) =>
  Math.max(head[i].length, ...rows.map((r) => String(r[c] ?? "").length)),
);

console.log("\n  LOCAL COPY\n");
console.log("  " + head.map((h, i) => h.padEnd(widths[i])).join("  "));
console.log("  " + widths.map((w) => "-".repeat(w)).join("  "));
for (const r of rows) {
  console.log("  " + cols.map((c, i) => String(r[c] ?? "").padEnd(widths[i])).join("  "));
}

console.log(`
  Now run the identical query on the source and compare.
  Every line must match. Paste this into the Lovable SQL editor:
  ${"-".repeat(60)}`);
console.log(FINGERPRINT.trim());
