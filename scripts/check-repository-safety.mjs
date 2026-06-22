#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatViolation,
  runRepositorySafetyChecks,
} from "./lib/repository-safety-checks.mjs";

const root = new URL("..", import.meta.url).pathname;

function listTrackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
    });
    return output.split("\0").filter(Boolean);
  } catch {
    console.error("Repository safety check requires a git repository.");
    process.exit(1);
  }
}

function readTrackedFile(relativePath) {
  try {
    return readFileSync(join(root, relativePath), "utf8");
  } catch {
    return null;
  }
}

const trackedPaths = listTrackedFiles();
const violations = runRepositorySafetyChecks(trackedPaths, readTrackedFile);

if (violations.length > 0) {
  console.error("Repository safety violations found:\n");
  for (const violation of violations) {
    console.error(`  ${formatViolation(violation)}`);
  }
  console.error(`\n${violations.length} violation(s) detected.`);
  process.exit(1);
}

console.log("No repository safety violations found.");
