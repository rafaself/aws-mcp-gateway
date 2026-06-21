import { describe, expect, it } from "vitest";
import { audienceCandidates, hasExpectedAudience } from "./token-claims.js";

const EXPECTED_AUDIENCE = "https://gateway.example.com";

describe("audienceCandidates", () => {
  it("includes origin and /mcp alias for configured worker audience", () => {
    expect(audienceCandidates(EXPECTED_AUDIENCE)).toEqual([
      "https://gateway.example.com",
      "https://gateway.example.com/mcp",
    ]);
  });

  it("does not add /mcp when audience already ends with /mcp", () => {
    expect(audienceCandidates("https://gateway.example.com/mcp")).toEqual([
      "https://gateway.example.com/mcp",
    ]);
  });
});

describe("hasExpectedAudience", () => {
  it("accepts aud matching the configured origin", () => {
    expect(hasExpectedAudience({ aud: EXPECTED_AUDIENCE }, EXPECTED_AUDIENCE)).toBe(true);
  });

  it("accepts aud with /mcp suffix when configured audience is origin only", () => {
    expect(
      hasExpectedAudience({ aud: `${EXPECTED_AUDIENCE}/mcp` }, EXPECTED_AUDIENCE),
    ).toBe(true);
  });

  it("accepts resource claim with /mcp suffix", () => {
    expect(
      hasExpectedAudience({ resource: `${EXPECTED_AUDIENCE}/mcp` }, EXPECTED_AUDIENCE),
    ).toBe(true);
  });

  it("rejects unrelated audiences", () => {
    expect(hasExpectedAudience({ aud: "https://other.example.com" }, EXPECTED_AUDIENCE)).toBe(
      false,
    );
    expect(
      hasExpectedAudience({ aud: "https://other.example.com/mcp" }, EXPECTED_AUDIENCE),
    ).toBe(false);
  });
});
