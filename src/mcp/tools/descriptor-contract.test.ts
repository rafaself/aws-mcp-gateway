import { describe, expect, it } from "vitest";
import type { GatewayContext } from "../../config/context.js";
import { createServer, listToolsSnapshot } from "../server.js";

const testContext: GatewayContext = {
  credentials: { accessKeyId: "AKIA-test", secretAccessKey: "test-secret" },
  region: "us-east-1",
  allowedRegions: ["us-east-1", "us-west-2"],
  mcpResourceUrl: "https://aws-mcp-gateway.example.workers.dev",
};

const CHATGPT_CONNECTOR_TOOLS = ["search", "fetch"] as const;

const AWS_BACKED_TOOLS = [
  "get_aws_cost_summary",
  "get_aws_cost_by_service",
  "list_ec2_instances",
  "get_cloudwatch_alarms",
  "get_recent_log_errors",
] as const;

const STRUCTURED_OUTPUT_TOOLS = [
  ...CHATGPT_CONNECTOR_TOOLS,
  ...AWS_BACKED_TOOLS,
] as const;

const OAUTH_ONLY_TOOLS = ["fetch", "get_gateway_status", ...AWS_BACKED_TOOLS] as const;

const PUBLIC_TOOLS = [...CHATGPT_CONNECTOR_TOOLS, "get_gateway_status", ...AWS_BACKED_TOOLS] as const;

describe("MCP tool descriptor contract", () => {
  const server = createServer(testContext);
  const { tools } = listToolsSnapshot(server);
  const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

  it("lists every public tool", () => {
    expect(tools.map((tool) => tool.name).sort()).toEqual([...PUBLIC_TOOLS].sort());
  });

  it("search advertises noauth and oauth2 for ChatGPT discovery", () => {
    const tool = toolsByName.search;
    expect(tool.securitySchemes).toEqual([
      { type: "noauth" },
      { type: "oauth2", scopes: ["aws:read"] },
    ]);
    expect((tool._meta as { securitySchemes: unknown }).securitySchemes).toEqual([
      { type: "noauth" },
      { type: "oauth2", scopes: ["aws:read"] },
    ]);
    expect((tool._meta as Record<string, unknown>)["mcp/www_authenticate"]).toBeUndefined();
  });

  for (const toolName of OAUTH_ONLY_TOOLS) {
    it(`${toolName} advertises OAuth security metadata`, () => {
      const tool = toolsByName[toolName];

      expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["aws:read"] }]);
      expect((tool._meta as { securitySchemes: unknown }).securitySchemes).toEqual([
        { type: "oauth2", scopes: ["aws:read"] },
      ]);
      expect((tool._meta as Record<string, unknown>)["mcp/www_authenticate"]).toBeUndefined();
    });
  }

  for (const toolName of PUBLIC_TOOLS) {
    it(`${toolName} declares read-only annotations`, () => {
      const annotations = toolsByName[toolName].annotations as Record<string, boolean>;

      expect(annotations.readOnlyHint).toBe(true);
      expect(annotations.destructiveHint).toBe(false);
    });
  }

  for (const toolName of AWS_BACKED_TOOLS) {
    it(`${toolName} advertises external read-only access`, () => {
      const annotations = toolsByName[toolName].annotations as Record<string, boolean>;

      expect(annotations.openWorldHint).toBe(true);
    });
  }

  it("get_gateway_status is local and idempotent", () => {
    const annotations = toolsByName.get_gateway_status.annotations as Record<string, boolean>;

    expect(annotations.openWorldHint).toBe(false);
    expect(annotations.idempotentHint).toBe(true);
  });

  it("ChatGPT connector tools are local discovery helpers", () => {
    for (const toolName of CHATGPT_CONNECTOR_TOOLS) {
      const annotations = toolsByName[toolName].annotations as Record<string, boolean>;
      expect(annotations.openWorldHint).toBe(false);
      expect(annotations.idempotentHint).toBe(true);
    }
  });

  for (const toolName of STRUCTURED_OUTPUT_TOOLS) {
    it(`${toolName} declares outputSchema`, () => {
      expect(toolsByName[toolName].outputSchema).toBeDefined();
      expect(toolsByName[toolName].outputSchema).toMatchObject({ type: "object" });
    });
  }

  it("does not advertise write scopes or management scopes", () => {
    const serialized = JSON.stringify(tools);

    expect(serialized).not.toContain("aws:write");
    expect(serialized).not.toContain("management");
    expect(serialized).not.toContain("AKIA");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("execution");
    expect(serialized).not.toContain("run_aws_cli");
    expect(serialized).not.toContain("call_any_aws_api");
  });

  it("only search advertises noauth", () => {
    const noauthTools = tools.filter((tool) =>
      tool.securitySchemes.some((scheme) => scheme.type === "noauth"),
    );
    expect(noauthTools.map((tool) => tool.name)).toEqual(["search"]);
  });

  it("does not embed hardcoded OAuth discovery URLs in tool descriptors", () => {
    const serialized = JSON.stringify(tools);

    expect(serialized).not.toContain("gateway.example.com");
    expect(serialized).not.toContain("auth.example.com");
  });
});
