import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../context.js";
import { registerListEc2InstancesTool } from "./list-ec2-instances.js";
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

const testContext: GatewayContext = {
  credentials: { accessKeyId: "AKIA-test", secretAccessKey: "test-secret" },
  region: "us-east-1",
  allowedRegions: ["us-east-1", "us-west-2"],
};

const singleRegionContext: GatewayContext = {
  credentials: { accessKeyId: "AKIA-test", secretAccessKey: "test-secret" },
  region: "us-east-1",
  allowedRegions: ["us-east-1"],
};

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
    registerListEc2InstancesTool(mock.server, testContext);
    const tool = mock.getTool("list_ec2_instances");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("list_ec2_instances");
  });

  it("includes description about EC2 instances", () => {
    const mock = makeMockServer();
    registerListEc2InstancesTool(mock.server, testContext);
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
    registerListEc2InstancesTool(mock.server, singleRegionContext);
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("structuredContent");

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    expect(content.text).toContain("Found 1 EC2 instance(s) across 1 region(s).");

    expect(result.structuredContent).toEqual({
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
    registerListEc2InstancesTool(mock.server, testContext);
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
    registerListEc2InstancesTool(mock.server, singleRegionContext);
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    expect(result.structuredContent).toEqual({
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
    registerListEc2InstancesTool(mock.server, testContext);
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
    registerListEc2InstancesTool(mock.server, singleRegionContext);
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
    registerListEc2InstancesTool(mock.server, testContext);
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({ states: ["INVALID"] }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "invalid_state_filter", retryable: false },
    });
  });

  it("returns isError for region not in allowlist", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    const mock = makeMockServer();
    registerListEc2InstancesTool(mock.server, testContext);
    const tool = mock.getTool("list_ec2_instances")!;
    const result = await tool.handler({ regions: ["eu-central-1"] }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "region_not_allowed", retryable: false },
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
    registerListEc2InstancesTool(mock.server, singleRegionContext);
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
});
