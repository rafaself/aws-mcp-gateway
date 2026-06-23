import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import type { ToolPack } from "./manifest.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const securityContext = createTestGatewayContext({
  allowedRegions: ["us-east-1"],
  toolExposure: {
    enabledToolPacks: new Set<ToolPack>([
      "core",
      "cost",
      "inventory",
      "observability",
      "database",
      "security",
    ]),
    enabledTools: [],
    disabledTools: new Set(),
    maxRiskLevel: "read-only",
  },
});

interface CapturedTool {
  name: string;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function makeMockServer() {
  const tools: CapturedTool[] = [];
  const server = {
    registerTool: (n: string, _c: unknown, h: (args: Record<string, unknown>) => Promise<unknown>) => {
      tools.push({ name: n, handler: h });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;
  return { server, getTool: (name: string) => tools.find((t) => t.name === name) };
}

function describeParametersResponse(parameters: Array<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ Parameters: parameters }), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("check_ssm_parameter_inventory tool", () => {
  it("returns metadata inventory without parameter values", async () => {
    mockFetch.mockResolvedValue(
      describeParametersResponse([
        {
          Name: "/app/prod/db/host",
          Type: "SecureString",
          Version: 2,
          LastModifiedDate: 1_718_000_000_000,
          KeyId: "alias/aws/ssm",
          Value: "super-secret-host",
        },
      ]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, securityContext, "check_ssm_parameter_inventory");
    const result = (await mock.getTool("check_ssm_parameter_inventory")!.handler({
      parameterPrefix: "/app/prod",
      requiredParameterNames: ["db/host", "missing"],
      region: "us-east-1",
    })) as Record<string, unknown>;

    expect(result.structuredContent).toMatchObject({
      parameterPrefix: "/app/prod",
      missingCount: 1,
      parameters: [
        {
          name: "db/host",
          path: "/app/prod/db/host",
          exists: true,
          type: "SecureString",
        },
        {
          name: "missing",
          exists: false,
        },
      ],
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain("super-secret-host");
    expect(JSON.stringify(result.structuredContent)).not.toContain("Value");
  });

  it("rejects invalid prefix before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, securityContext, "check_ssm_parameter_inventory");
    const result = (await mock.getTool("check_ssm_parameter_inventory")!.handler({
      parameterPrefix: "app/prod",
      requiredParameterNames: ["db/host"],
      region: "us-east-1",
    })) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects disallowed region before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, securityContext, "check_ssm_parameter_inventory");
    const result = (await mock.getTool("check_ssm_parameter_inventory")!.handler({
      parameterPrefix: "/app/prod",
      requiredParameterNames: ["db/host"],
      region: "eu-west-1",
    })) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
