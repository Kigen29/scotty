#!/usr/bin/env node
/**
 * Lint debt ratchet.
 *
 * The repo carries a known backlog of `no-explicit-any` warnings from its
 * hand-rolled data fetching. Erroring on all of them would block every PR;
 * ignoring them lets the backlog grow forever. So we record the current count
 * and fail CI if it goes up.
 *
 * When you reduce the count, this script tells you to lower the budget — that
 * is the ratchet clicking, and the new number belongs in the same commit.
 *
 *   npm run lint:budget            check against .lintbudget
 *   npm run lint:budget -- --write record the current count as the new budget
 *
 * Uses ESLint's Node API rather than shelling out, so it behaves identically
 * on Windows and on CI's Ubuntu runners.
 */
import { ESLint } from "eslint";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BUDGET_FILE = ".lintbudget";
const WRITE = process.argv.includes("--write");

const eslint = new ESLint();
const results = await eslint.lintFiles(["."]);

let errors = 0;
let warnings = 0;
for (const result of results) {
  errors += result.errorCount ?? 0;
  warnings += result.warningCount ?? 0;
}

if (errors > 0) {
  console.error(`✖ ${errors} lint error(s). Errors are never budgeted — fix them.`);
  console.error(`  Run \`npm run lint\` to see them.`);
  process.exit(1);
}

if (WRITE || !existsSync(BUDGET_FILE)) {
  writeFileSync(BUDGET_FILE, `${warnings}\n`, "utf8");
  console.log(`Wrote ${BUDGET_FILE} = ${warnings}`);
  process.exit(0);
}

const budget = Number.parseInt(readFileSync(BUDGET_FILE, "utf8").trim(), 10);

if (Number.isNaN(budget)) {
  console.error(`${BUDGET_FILE} does not contain a number.`);
  process.exit(2);
}

if (warnings > budget) {
  console.error(
    `✖ Lint warnings went up: ${warnings} (budget ${budget}, +${warnings - budget}).\n` +
      `  Fix the new warnings, or justify raising the budget in your PR description.`,
  );
  process.exit(1);
}

if (warnings < budget) {
  console.error(
    `↓ Lint warnings went down: ${warnings} (budget ${budget}, -${budget - warnings}). Nice.\n` +
      `  Lower the budget in the same commit:  npm run lint:budget -- --write`,
  );
  process.exit(1);
}

console.log(`✓ Lint warnings at budget: ${warnings}`);
