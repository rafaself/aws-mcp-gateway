import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { GatewayContext } from "../../config/context.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import {
  ec2XmlResponse,
  describeInstancesXml,
  instanceXml,
} from "../../test/fixtures.js";

const { mockFetch } = vi.hoisted(() => {
  return { mockFetch: vi.fn() };
});

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    accessKeyId: string;
    secretAccessKey: string;
    service: string | undefined;
    region: string | undefined;
    fetch = mockFetch;

    constructor(opts: {
      accessKeyId: string;
      secretAccessKey: string;
      service?: string;
      region?: string;
    }) {
      this.accessKeyId = opts.accessKeyId;
      this.secretAccessKey = opts.secretAccessKey;
      this.service = opts.service;
      this.region = opts.region;
    }
  },
}));

const testContext = createTestGatewayContext();

const singleRegionContext = createTestGatewayContext({ allowedRegions: ["us-east-1"] });

interface CapturedTool {
  name: string;
  config: unknown;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function makeMockServer(): {
  server: McpServer;
  getTool(name: string): CapturedTool | undefined;
} {
  const tools: CapturedTool[] = [];

  const server = {
    registerTool: (
      n: string,
      c: unknown,
      h: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      tools.push({ name: n, config: c, handler: h });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;

  return {
    server,
    getTool(name: string) { return tools.find((t) => t.name === name); },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("registerListEc2InstancesTool", () => {
  it("registers list_ec2_instances tool", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("list_ec2_instances");
  });

  it("includes description about EC2 instances", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    const cfg = tool.config as { description?: string };
    expect(cfg.description).toContain("EC2 instances");
  });

  it("returns content and structuredContent on success", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({ instanceId: "i-11111111" }),
          ]),
        ),
      ),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("structuredContent");

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    expect(content.text).toContain("Found 1 EC2 instance(s) across 1 region(s).");

    expect(result.structuredContent).toMatchObject({
      regions: ["us-east-1"],
      count: 1,
      instances: [
        {
          instanceId: "i-11111111",
          region: "us-east-1",
          state: "running",
          instanceType: "t3.micro",
          name: "test-instance",
        },
      ],
    });
  });

  it("returns instances from multiple regions", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("us-east-1")) {
        return Promise.resolve(
          ec2XmlResponse(
            describeInstancesXml([
              instanceXml({
                instanceId: "i-11111111",
                availabilityZone: "us-east-1a",
              }),
            ]),
          ),
        );
      }
      return Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({
              instanceId: "i-22222222",
              availabilityZone: "us-west-2b",
            }),
          ]),
        ),
      );
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    const structured = result.structuredContent as {
      regions: string[];
      count: number;
      instances: Array<{ instanceId: string }>;
    };
    expect(structured.regions).toEqual(["us-east-1", "us-west-2"]);
    expect(structured.count).toBe(2);
    expect(structured.instances).toHaveLength(2);

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    expect(content.text).toContain("Found 2 EC2 instance(s) across 2 region(s).");
  });

  it("returns empty result when no instances exist", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    expect(result.structuredContent).toMatchObject({
      regions: [],
      count: 0,
      instances: [],
    });

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    expect(content.text).toContain("Found 0 EC2 instance(s) across 0 region(s).");
  });

  it("filters by regions when provided", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    await tool.handler({ regions: ["us-east-1"] }) as Record<string, unknown>;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0][0] as string;
    expect(callArgs).toContain("us-east-1");
  });

  it("filters by states when provided", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    await tool.handler({ states: ["running"] }) as Record<string, unknown>;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const body = (callArgs[1] as { body?: string }).body ?? "";
    expect(body).toContain("Filter.1.Value.1=running");
  });

  it("returns isError for invalid state", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({ states: ["INVALID"] }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("returns isError for region not in allowlist", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({ regions: ["eu-central-1"] }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("does not leak raw EC2 response fields in MCP output", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml(),
          ]),
        ),
      ),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain("launchTime");
    expect(resultStr).not.toContain("availabilityZone");
    expect(resultStr).not.toContain("publicIpAddress");
    expect(resultStr).not.toContain("privateIpAddress");
    expect(resultStr).not.toContain("tagSet");
    expect(resultStr).not.toContain("reservationId");
    expect(resultStr).not.toContain("ownerId");
  });

  it("returns instances in deterministic order (by region then instanceId)", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("us-west-2")) {
        return Promise.resolve(
          ec2XmlResponse(
            describeInstancesXml([
              instanceXml({ instanceId: "i-b-001" }),
            ]),
          ),
        );
      }
      return Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({ instanceId: "i-a-001" }),
            instanceXml({ instanceId: "i-a-002" }),
          ]),
        ),
      );
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    const instances = (result.structuredContent as Record<string, unknown>).instances as Array<{ instanceId: string; region: string }>;
    expect(instances).toHaveLength(3);
    expect(instances[0].instanceId).toBe("i-a-001");
    expect(instances[0].region).toBe("us-east-1");
    expect(instances[1].instanceId).toBe("i-a-002");
    expect(instances[1].region).toBe("us-east-1");
    expect(instances[2].instanceId).toBe("i-b-001");
    expect(instances[2].region).toBe("us-west-2");
  });

  it("returns normalized error when all regions fail", async () => {
    mockFetch.mockRejectedValue(new Error("EC2 service down"));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_ec2_instances");
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "aws_request_failed", retryable: false },
    });
    expect(result.structuredContent).not.toHaveProperty("execution");
  });

  it("records fanout AWS request counts across regions on cache miss", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("us-east-1") || url.includes("us-west-2")) {
        return Promise.resolve(
          ec2XmlResponse(describeInstancesXml([instanceXml({ instanceId: "i-fanout" })])),
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const mockKv = {
      get: vi.fn(async () => null),
      put: vi.fn(),
    } as never;

    const ctxWithCache: GatewayContext = { ...testContext, cache: mockKv };
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, ctxWithCache, "list_ec2_instances");
    const result = await mock.getTool("list_ec2_instances")!.handler({}) as {
      structuredContent: Record<string, unknown>;
    };

    const execution = result.structuredContent.execution as {
      cache: { status: string };
      awsRequestCount: number;
      awsRequests: Array<{ action: string; requestCount: number }>;
    };

    expect(execution.cache.status).toBe("miss");
    expect(execution.awsRequestCount).toBe(2);
    expect(execution.awsRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "ec2:DescribeInstances",
          requestCount: 2,
        }),
      ]),
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
