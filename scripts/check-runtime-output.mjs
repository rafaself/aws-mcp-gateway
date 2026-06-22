#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  formatViolation,
  runRuntimeOutputChecks,
} from "./lib/runtime-output-checks.mjs";

const root = new URL("..", import.meta.url).pathname;
const srcRoot = join(root, "src");

function listSourceFiles(directory, prefix = "src") {
  const entries = readdirSync(directory);
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry);
    const relativePath = `${prefix}/${entry}`;
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      files.push(...listSourceFiles(absolutePath, relativePath));
      continue;
    }

    files.push(relativePath);
  }

  return files;
}

function readSourceFile(relativePath) {
  try {
    return readFileSync(join(root, relativePath), "utf8");
  } catch {
    return null;
  }
}

const sourcePaths = listSourceFiles(srcRoot);
const violations = runRuntimeOutputChecks(sourcePaths, readSourceFile);

if (violations.length > 0) {
  console.error("Runtime output guardrail violations found:\n");
  for (const violation of violations) {
    console.error(`  ${formatViolation(violation)}`);
  }
  console.error(`\n${violations.length} violation(s) detected.`);
  process.exit(1);
}

console.log("No runtime output guardrail violations found.");
