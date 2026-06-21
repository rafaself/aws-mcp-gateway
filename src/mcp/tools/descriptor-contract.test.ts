import { describe, expect, it } from "vitest";
import type { GatewayContext } from "../../config/context.js";
import { createServer, listToolsSnapshot } from "../server.js";

const testContext: GatewayContext = {
  credentials: { accessKeyId: "AKIA-test", secretAccessKey: "test-secret" },
  region: "us-east-1",
  allowedRegions: ["us-east-1", "us-west-2"],
};

const AWS_BACKED_TOOLS = [
  "get_aws_cost_summary",
  "get_aws_cost_by_service",
  "list_ec2_instances",
  "get_cloudwatch_alarms",
  "get_recent_log_errors",
] as const;

const STRUCTURED_OUTPUT_TOOLS = [...AWS_BACKED_TOOLS] as const;

const PUBLIC_TOOLS = ["get_gateway_status", ...AWS_BACKED_TOOLS] as const;

describe("MCP tool descriptor contract", () => {
  const server = createServer(testContext);
  const { tools } = listToolsSnapshot(server);
  const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

  it("lists every public tool", () => {
    expect(tools.map((tool) => tool.name).sort()).toEqual([...PUBLIC_TOOLS].sort());
  });

  for (const toolName of PUBLIC_TOOLS) {
    it(`${toolName} advertises OAuth security metadata`, () => {
      const tool = toolsByName[toolName];

      expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["aws:read"] }]);
      expect((tool._meta as { securitySchemes: unknown }).securitySchemes).toEqual([
        { type: "oauth2", scopes: ["aws:read"] },
      ]);
      expect((tool._meta as Record<string, unknown>)["mcp/www_authenticate"]).toBeUndefined();
    });

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

  for (const toolName of STRUCTURED_OUTPUT_TOOLS) {
    it(`${toolName} declares outputSchema`, () => {
      expect(toolsByName[toolName].outputSchema).toBeDefined();
      expect(toolsByName[toolName].outputSchema).toMatchObject({ type: "object" });
    });
  }

  it("does not advertise noauth, write scopes, or management scopes", () => {
    const serialized = JSON.stringify(tools);

    expect(serialized).not.toContain("noauth");
    expect(serialized).not.toContain("aws:write");
    expect(serialized).not.toContain("management");
    expect(serialized).not.toContain("AKIA");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("execution");
  });

  it("does not embed hardcoded OAuth discovery URLs in tool descriptors", () => {
    const serialized = JSON.stringify(tools);

    expect(serialized).not.toContain("gateway.example.com");
    expect(serialized).not.toContain("auth.example.com");
  });
});
