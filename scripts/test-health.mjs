#!/usr/bin/env node
/**
 * Test health report.
 *
 * Answers "are there actually tests, and do they cover anything?" — a suite can
 * pass while proving nothing, which is the situation this repo starts in.
 * Run after `npm run test:coverage`.
 *
 * Writes a markdown table to GITHUB_STEP_SUMMARY when running in Actions, so
 * the numbers show up on the run page rather than buried in logs.
 *
 *   --strict   exit non-zero if the suite looks like a placeholder
 *              (used by the nightly job, not by PR CI)
 */
import { readFileSync, existsSync, appendFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const STRICT = process.argv.includes("--strict");
const SUMMARY_PATH = "coverage/coverage-summary.json";

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "ui") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const srcFiles = walk("src").map((f) => relative(".", f).replace(/\\/g, "/"));
const sourceFiles = srcFiles.filter(
  (f) =>
    /\.(ts|tsx)$/.test(f) &&
    !/\.(test|spec)\.(ts|tsx)$/.test(f) &&
    !f.startsWith("src/test/") &&
    !f.endsWith(".d.ts") &&
    !f.includes("src/integrations/supabase/types.ts"),
);
const testFiles = srcFiles.filter((f) => /\.(test|spec)\.(ts|tsx)$/.test(f));

const edgeFunctions = existsSync("supabase/functions")
  ? readdirSync("supabase/functions").filter((d) =>
      statSync(join("supabase/functions", d)).isDirectory(),
    )
  : [];
const edgeTests = walk("supabase/functions").filter((f) => /\.(test|spec)\.ts$/.test(f));

let cov = null;
if (existsSync(SUMMARY_PATH)) {
  cov = JSON.parse(readFileSync(SUMMARY_PATH, "utf8")).total;
} else {
  console.error(`No ${SUMMARY_PATH} — run \`npm run test:coverage\` first.`);
}

const pct = (v) => (v == null ? "n/a" : `${v}%`);
const ratio = sourceFiles.length ? (testFiles.length / sourceFiles.length) * 100 : 0;

const rows = [
  ["Frontend source files", String(sourceFiles.length)],
  ["Frontend test files", String(testFiles.length)],
  ["Test-to-source ratio", `${ratio.toFixed(1)}%`],
  ["Edge functions", String(edgeFunctions.length)],
  ["Edge function test files", String(edgeTests.length)],
];

if (cov) {
  rows.push(
    ["Line coverage", `${pct(cov.lines?.pct)} (${cov.lines?.covered}/${cov.lines?.total})`],
    ["Branch coverage", pct(cov.branches?.pct)],
    ["Function coverage", `${pct(cov.functions?.pct)} (${cov.functions?.covered}/${cov.functions?.total})`],
  );
}

// --- console ---
const width = Math.max(...rows.map(([k]) => k.length));
console.log("\nTest health\n" + "-".repeat(width + 24));
for (const [k, v] of rows) console.log(`${k.padEnd(width)}   ${v}`);
console.log("-".repeat(width + 24));

// --- warnings ---
const warnings = [];
if (testFiles.length === 0) warnings.push("No frontend test files at all.");
if (cov && cov.lines?.pct === 0)
  warnings.push("Line coverage is 0% — the suite exercises none of the application.");
if (edgeTests.length === 0 && edgeFunctions.length > 0)
  warnings.push(
    `${edgeFunctions.length} edge functions have no tests — these are the parts that spend money and email people.`,
  );
if (testFiles.length > 0 && cov && cov.lines?.total > 1000 && cov.lines?.pct < 5)
  warnings.push("Tests exist but assert almost nothing about real behaviour (placeholder suite).");

for (const w of warnings) console.log(`  ⚠ ${w}`);
if (!warnings.length) console.log("  ✓ No structural gaps detected.");
console.log();

// --- GitHub summary ---
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    "## Test health",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    ...rows.map(([k, v]) => `| ${k} | \`${v}\` |`),
    "",
    ...(warnings.length
      ? ["### Gaps", "", ...warnings.map((w) => `- ⚠️ ${w}`)]
      : ["✅ No structural gaps detected."]),
    "",
  ].join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n", "utf8");
}

if (STRICT && warnings.length) {
  console.error(`✖ --strict: ${warnings.length} structural gap(s) in the test suite.`);
  process.exit(1);
}
