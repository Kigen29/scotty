#!/usr/bin/env node
/**
 * Type-check and lint the Deno edge functions.
 *
 * The edge functions run on Deno, so `npm run lint` and `tsc` do not properly
 * cover them — an undefined identifier ships silently. `deno check` catches it.
 *
 *   npm run edge:check    type-check every function entrypoint
 *   npm run edge:lint     deno lint
 *   npm run edge:fmt      deno fmt (rewrites files)
 *
 * Written in Node rather than as a shell one-liner because npm runs scripts
 * through cmd.exe on Windows, where a POSIX shell loop over the function
 * directories fails with "f was unexpected at this time".
 */
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const FUNCTIONS_DIR = join("supabase", "functions");
// Naming the extension explicitly lets spawnSync find Deno on PATH without
// shell:true, which would otherwise trip Node's DEP0190 warning.
const DENO = process.platform === "win32" ? "deno.exe" : "deno";
const mode = process.argv[2] ?? "check";

if (!existsSync(FUNCTIONS_DIR)) {
  console.error(`No ${FUNCTIONS_DIR} directory.`);
  process.exit(2);
}

// Deno resolves from cwd, so every command runs inside supabase/functions where
// deno.json lives. Without it, the npm: imports fail to resolve and the error
// looks like a code bug.
const run = (args) =>
  spawnSync(DENO, args, { cwd: FUNCTIONS_DIR, stdio: "inherit" });

const probe = spawnSync(DENO, ["--version"], { encoding: "utf8" });
if (probe.status !== 0) {
  console.error(
    "Deno is not installed or not on PATH.\n" +
      "  macOS/Linux:  curl -fsSL https://deno.land/install.sh | sh\n" +
      "  Windows:      irm https://deno.land/install.ps1 | iex\n" +
      "CI installs it via denoland/setup-deno.",
  );
  process.exit(127);
}
console.log((probe.stdout || "").split("\n")[0]);

if (mode === "lint" || mode === "fmt") {
  const result = run([mode]);
  process.exit(result.status ?? 1);
}

const entrypoints = readdirSync(FUNCTIONS_DIR)
  .filter((name) => statSync(join(FUNCTIONS_DIR, name)).isDirectory() && name !== "node_modules")
  .map((name) => `${name}/index.ts`)
  .filter((rel) => existsSync(join(FUNCTIONS_DIR, rel)))
  .sort();

if (entrypoints.length === 0) {
  console.error("No function entrypoints found.");
  process.exit(2);
}

const failed = [];
for (const entry of entrypoints) {
  const result = run(["check", "--allow-import", entry]);
  if (result.status !== 0) failed.push(entry);
}

console.log("");
if (failed.length > 0) {
  console.error(`${failed.length} of ${entrypoints.length} function(s) failed deno check:`);
  for (const f of failed) console.error(`  - supabase/functions/${f}`);
  process.exit(1);
}
console.log(`All ${entrypoints.length} edge functions type-check.`);
