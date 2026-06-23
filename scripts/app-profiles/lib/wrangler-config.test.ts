import { describe, expect, it } from "vitest";
import { loadAppProfileCliConfig, parseJsonc } from "./wrangler-config.js";

describe("wrangler config loader", () => {
  it("loads allowed regions and index key from wrangler.example.jsonc", () => {
    const config = loadAppProfileCliConfig("wrangler.example.jsonc");
    expect(config.allowedRegions).toEqual(["us-east-1", "sa-east-1"]);
    expect(config.indexKey).toBe("app-profiles/index.json");
    expect(config.hasAppConfigBinding).toBe(true);
  });

  it("parses jsonc comments and trailing commas", () => {
    const parsed = parseJsonc(`{
      // comment
      "vars": {
        "AWS_ALLOWED_REGIONS": "us-east-1",
      },
      "kv_namespaces": [
        { "binding": "AWS_MCP_APP_CONFIG", "id": "<id>" },
      ],
    }`);

    expect(parsed).toEqual({
      vars: { AWS_ALLOWED_REGIONS: "us-east-1" },
      kv_namespaces: [{ binding: "AWS_MCP_APP_CONFIG", id: "<id>" }],
    });
  });
});
