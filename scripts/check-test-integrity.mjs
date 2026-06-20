import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const srcDir = join(root, "src");
const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith(".test.ts")) {
      checkFile(fullPath);
    }
  }
}

function checkFile(filePath) {
  const lines = readFileSync(filePath, "utf8").split("\n");
  const relPath = relative(root, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (/\.(only)\s*\(/.test(line)) {
      violations.push(`${relPath}:${lineNum}: focused test marker .only()`);
    }

    if (/(?:\.skip\s*\(|(?:test|describe|it)\.skip\s*\()/.test(line) && !line.includes("intentional-skip:")) {
      violations.push(`${relPath}:${lineNum}: skipped test without intentional-skip: justification`);
    }
  }
}

walk(srcDir);

if (violations.length > 0) {
  console.error("Test integrity violations found:\n");
  for (const v of violations) {
    console.error(`  ${v}`);
  }
  console.error(`\n${violations.length} violation(s) detected.`);
  process.exit(1);
} else {
  console.log("No test integrity violations found.");
}
