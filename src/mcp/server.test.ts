import { describe, it, expect, vi } from "vitest";
import { createTestGatewayContext } from "../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    name: string;
    version: string;
    tools: Array<{ name: string; config: unknown }>;

    constructor(opts: { name: string; version: string }) {
      this.name = opts.name;
      this.version = opts.version;
      this.tools = [];
    }

    registerTool(name: string, config: unknown) {
      this.tools.push({ name, config });
      return {} as ReturnType<McpServer["registerTool"]>;
    }
  },
}));

const { createServer } = await import("./server.js");

const testContext = createTestGatewayContext({ allowedRegions: ["us-east-1"] });

describe("createServer", () => {
  it("creates an McpServer with correct name and version", () => {
    const server = createServer(testContext) as unknown as {
      name: string;
      version: string;
      tools: Array<{ name: string }>;
    };

    expect(server.name).toBe("aws-mcp-gateway");
    expect(server.version).toBe("0.1.0");
  });

  it("registers all expected tools", () => {
    const server = createServer(testContext) as unknown as {
      tools: Array<{ name: string }>;
    };

    const toolNames = server.tools.map((t) => t.name);
    expect(toolNames).toContain("search");
    expect(toolNames).toContain("fetch");
    expect(toolNames).toContain("get_gateway_status");
    expect(toolNames).toContain("get_aws_cost_summary");
    expect(toolNames).toContain("get_aws_cost_by_service");
    expect(toolNames).toContain("list_ec2_instances");
    expect(toolNames).toContain("get_cloudwatch_alarms");
    expect(toolNames).toContain("get_recent_log_errors");
  });
});
