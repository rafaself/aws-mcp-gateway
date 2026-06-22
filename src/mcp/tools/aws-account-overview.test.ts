import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { defaultResolvedToolExposure } from "../../config/tool-exposure.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import {
  ec2XmlResponse,
  describeInstancesXml,
  instanceXml,
  lambdaListFunctionsResponse,
  makeLambdaFunction,
  s3ListBucketsXml,
} from "../../test/fixtures.js";
import type { ToolPack } from "./manifest.js";
import { OVERVIEW_SAMPLE_LIMIT } from "../../security/limits.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const singleRegionContext = createTestGatewayContext({
  allowedRegions: ["us-east-1"],
  toolExposure: {
    ...defaultResolvedToolExposure(),
    enabledToolPacks: new Set<ToolPack>([
      "core",
      "cost",
      "inventory",
      "observability",
      "aggregates",
    ]),
  },
});

interface CapturedTool {
  name: string;
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
      _c: unknown,
      h: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      tools.push({ name: n, handler: h });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;

  return {
    server,
    getTool(name: string) {
      return tools.find((t) => t.name === name);
    },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("aws_account_overview", () => {
  it("registers aws_account_overview tool", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_account_overview");
    expect(mock.getTool("aws_account_overview")).toBeDefined();
  });

  it("returns bounded EC2 overview by default", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("ec2")) {
        return Promise.resolve(
          ec2XmlResponse(describeInstancesXml([instanceXml({ instanceId: "i-11111111" })])),
        );
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_account_overview");
    const result = (await mock.getTool("aws_account_overview")!.handler({})) as Record<
      string,
      unknown
    >;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const structured = result.structuredContent as {
      regions: string[];
      ec2?: { count: number; sample: unknown[] };
      lambda?: unknown;
      s3?: unknown;
    };
    expect(structured.regions).toEqual(["us-east-1"]);
    expect(structured.ec2?.count).toBe(1);
    expect(structured.ec2?.sample).toHaveLength(1);
    expect(structured.lambda).toBeUndefined();
    expect(structured.s3).toBeUndefined();
  });

  it("composes EC2, Lambda, and S3 when requested", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("ec2")) {
        return Promise.resolve(ec2XmlResponse(describeInstancesXml([])));
      }
      if (url.includes("lambda")) {
        return Promise.resolve(lambdaListFunctionsResponse([makeLambdaFunction()]));
      }
      if (url.includes("s3")) {
        return Promise.resolve(
          s3ListBucketsXml([{ name: "my-bucket", createdAt: "2026-01-01T00:00:00.000Z" }]),
        );
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_account_overview");
    const result = (await mock
      .getTool("aws_account_overview")!
      .handler({ include: ["ec2", "lambda", "s3"] })) as Record<string, unknown>;

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const structured = result.structuredContent as {
      ec2?: { count: number };
      lambda?: { count: number };
      s3?: { count: number };
    };
    expect(structured.ec2?.count).toBe(0);
    expect(structured.lambda?.count).toBe(1);
    expect(structured.s3?.count).toBe(1);
  });

  it("caps samples at OVERVIEW_SAMPLE_LIMIT", async () => {
    const instances = Array.from({ length: 10 }, (_, i) =>
      instanceXml({ instanceId: `i-${i.toString().padStart(8, "0")}` }),
    );
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml(instances))),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_account_overview");
    const result = (await mock.getTool("aws_account_overview")!.handler({})) as Record<
      string,
      unknown
    >;

    const ec2 = (result.structuredContent as { ec2: { count: number; sample: unknown[] } }).ec2;
    expect(ec2.count).toBe(10);
    expect(ec2.sample).toHaveLength(OVERVIEW_SAMPLE_LIMIT);
  });

  it("returns validation_error for disallowed region before AWS calls", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_account_overview");
    const result = (await mock
      .getTool("aws_account_overview")!
      .handler({ regions: ["eu-central-1"] })) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error.code).toBe("validation_error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("denies calls when aggregates pack is disabled", async () => {
    const defaultContext = createTestGatewayContext();
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, defaultContext, "aws_account_overview");
    const result = (await mock.getTool("aws_account_overview")!.handler({})) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error.code).toBe("validation_error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not leak raw AWS response fields", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([instanceXml()]))),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_account_overview");
    const result = (await mock.getTool("aws_account_overview")!.handler({})) as Record<
      string,
      unknown
    >;

    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain("reservationId");
    expect(resultStr).not.toContain("publicIpAddress");
    expect(resultStr).not.toContain("ResponseMetadata");
  });
});
