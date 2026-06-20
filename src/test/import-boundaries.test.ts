import { describe, expect, it } from "vitest";

const sourceModules = import.meta.glob("../**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function productionSourcePaths(): string[] {
  return Object.keys(sourceModules)
    .map((path) => path.replace(/^\.\.\//, ""))
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"));
}

function importsFrom(source: string, pattern: RegExp): boolean {
  return source
    .split("\n")
    .some((line) => line.trimStart().startsWith("import") && pattern.test(line));
}

describe("import boundaries", () => {
  const sourceFiles = productionSourcePaths();

  it("aws modules do not import mcp modules", () => {
    const violations = sourceFiles
      .filter((file) => file.startsWith("aws/"))
      .filter((file) => importsFrom(sourceModules[`../${file}`], /from ['"].*\/mcp\//));

    expect(violations).toEqual([]);
  });

  it("security modules do not import mcp modules", () => {
    const violations = sourceFiles
      .filter((file) => file.startsWith("security/"))
      .filter((file) => importsFrom(sourceModules[`../${file}`], /from ['"].*\/mcp\//));

    expect(violations).toEqual([]);
  });

  it("cache modules do not import aws client modules", () => {
    const violations = sourceFiles
      .filter((file) => file.startsWith("cache/"))
      .filter((file) => importsFrom(sourceModules[`../${file}`], /from ['"].*\/aws\//));

    expect(violations).toEqual([]);
  });

  it("config modules do not import mcp modules", () => {
    const violations = sourceFiles
      .filter((file) => file.startsWith("config/"))
      .filter((file) => importsFrom(sourceModules[`../${file}`], /from ['"].*\/mcp\//));

    expect(violations).toEqual([]);
  });
});
