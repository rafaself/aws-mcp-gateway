import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultResolvedToolExposure } from "../../config/tool-exposure.js";
import type { GatewayContext } from "../../config/context.js";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import {
  ceResponse,
  cwAlarmsResponse,
  describeInstancesXml,
  ec2XmlResponse,
  instanceXml,
  lambdaListFunctionsResponse,
  logsDescribeLogGroupsResponse,
  logsFilterEventsResponse,
  makeDayTotal,
  makeDayWithGroups,
  makeLambdaFunction,
  makeLogGroup,
  s3ListBucketsXml,
} from "../../test/fixtures.js";
import {
  toolExecutionMetadataSchema,
  type ToolExecutionBilling,
  type ToolExecutionMetadata,
} from "../execution/metadata.js";
import type { ToolPack } from "./manifest.js";
import type { PublicToolName } from "../../config/tool-exposure.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const AWS_BACKED_TOOLS = [
  "get_aws_cost_summary",
  "get_aws_cost_by_service",
  "list_ec2_instances",
  "get_cloudwatch_alarms",
  "get_cloudwatch_logs",
  "get_cloudwatch_alarm_summary",
  "get_recent_log_errors",
  "list_lambda_functions",
  "list_s3_buckets",
  "list_log_groups",
  "aws_account_overview",
  "aws_cost_overview",
  "aws_observability_overview",
] as const;

const PAID_TOOLS = [
  "get_aws_cost_summary",
  "get_aws_cost_by_service",
  "aws_cost_overview",
] as const;

const NON_AWS_TOOLS = ["search", "fetch", "get_gateway_status"] as const;

type AwsBackedToolName = (typeof AWS_BACKED_TOOLS)[number];

type ToolSuccessScenario = {
  toolName: AwsBackedToolName;
  setupMocks: () => void;
  args: Record<string, unknown>;
  useAggregatesContext?: boolean;
  billingExpect: Partial<ToolExecutionBilling>;
  expectVisibleBillingNote?: boolean;
};

type CapturedTool = {
  name: string;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

type McpToolResult = {
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

const baseContext = createTestGatewayContext({ allowedRegions: ["us-east-1"] });

const aggregatesContext = createTestGatewayContext({
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

function makeMockServer(): {
  server: McpServer;
  getTool(name: string): CapturedTool | undefined;
} {
  const tools: CapturedTool[] = [];
  const server = {
    registerTool: (
      name: string,
      _config: unknown,
      handler: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      tools.push({ name, handler });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;

  return {
    server,
    getTool(name: string) {
      return tools.find((tool) => tool.name === name);
    },
  };
}

function assertPublicExecutionShape(execution: unknown): ToolExecutionMetadata {
  const parsed = toolExecutionMetadataSchema.parse(execution);
  expect(Object.keys(parsed).sort()).toEqual([
    "awsRequestCount",
    "awsRequests",
    "billing",
    "cache",
  ]);
  const requestSum = parsed.awsRequests.reduce(
    (total, request) => total + request.requestCount,
    0,
  );
  expect(parsed.awsRequestCount).toBe(requestSum);
  return parsed;
}

function assertExecutionSanitized(execution: ToolExecutionMetadata): void {
  const serialized = JSON.stringify(execution);
  expect(serialized).not.toMatch(/AKIA/);
  expect(serialized).not.toMatch(/arn:aws/);
  expect(serialized).not.toMatch(/\d{12}/);
  expect(serialized).not.toContain("cacheKey");
  expect(serialized).not.toContain("secretAccessKey");
}

function contentText(result: McpToolResult): string {
  return result.content?.find((block) => block.type === "text")?.text ?? "";
}

async function invokeTool(
  toolName: PublicToolName,
  args: Record<string, unknown>,
  context: GatewayContext = baseContext,
): Promise<McpToolResult> {
  const mock = makeMockServer();
  registerMcpToolForTest(mock.server, context, toolName);
  return (await mock.getTool(toolName)!.handler(args)) as McpToolResult;
}

const TOOL_SUCCESS_SCENARIOS: ToolSuccessScenario[] = [
  {
    toolName: "get_aws_cost_summary",
    setupMocks: () => {
      mockFetch.mockResolvedValue(ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "42.50")]));
    },
    args: { startDate: "2025-01-01", endDate: "2025-02-01", granularity: "MONTHLY" },
    billingExpect: {
      costClass: "paid",
      pricingModel: "per-request",
      provider: "aws",
      currency: "USD",
    },
  },
  {
    toolName: "get_aws_cost_by_service",
    setupMocks: () => {
      mockFetch.mockResolvedValue(
        ceResponse([
          makeDayWithGroups("2025-01-01", "2025-02-01", "42.50", [
            { key: "Amazon EC2", amount: "42.50" },
          ]),
        ]),
      );
    },
    args: {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
      limit: 5,
    },
    billingExpect: {
      costClass: "paid",
      pricingModel: "per-request",
      provider: "aws",
      currency: "USD",
    },
  },
  {
    toolName: "list_ec2_instances",
    setupMocks: () => {
      mockFetch.mockResolvedValue(
        ec2XmlResponse(describeInstancesXml([instanceXml({ instanceId: "i-contract" })])),
      );
    },
    args: {},
    billingExpect: {
      costClass: "fanout-sensitive",
      pricingModel: "usage-dependent",
      estimatedCostUsd: 0,
    },
    expectVisibleBillingNote: false,
  },
  {
    toolName: "get_cloudwatch_alarms",
    setupMocks: () => {
      mockFetch.mockResolvedValue(
        cwAlarmsResponse([
          {
            AlarmName: "HighCPU",
            StateValue: "ALARM",
            StateReason: "Threshold Crossed",
            StateUpdatedTimestamp: "2026-06-19T12:00:00.000Z",
          },
        ]),
      );
    },
    args: { regions: ["us-east-1"], states: ["ALARM"] },
    billingExpect: {
      costClass: "fanout-sensitive",
      pricingModel: "usage-dependent",
      estimatedCostUsd: 0,
    },
    expectVisibleBillingNote: false,
  },
  {
    toolName: "get_recent_log_errors",
    setupMocks: () => {
      mockFetch.mockResolvedValue(
        logsFilterEventsResponse([
          {
            logStreamName: "2026/06/19/[$LATEST]abcdef",
            timestamp: 1718798400000,
            message: "ERROR: Example error message",
          },
        ]),
      );
    },
    args: {
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      hours: 1,
      limit: 20,
    },
    billingExpect: {
      costClass: "volume-sensitive",
      pricingModel: "usage-dependent",
      estimatedCostUsd: 0,
    },
    expectVisibleBillingNote: false,
  },
  {
    toolName: "get_cloudwatch_logs",
    setupMocks: () => {
      mockFetch.mockResolvedValue(
        logsFilterEventsResponse([
          {
            logStreamName: "2026/06/19/[$LATEST]abcdef",
            timestamp: 1718798400000,
            message: "INFO request completed",
          },
        ]),
      );
    },
    args: {
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      lookbackMinutes: 30,
      limit: 20,
    },
    billingExpect: {
      costClass: "volume-sensitive",
      pricingModel: "usage-dependent",
      estimatedCostUsd: 0,
    },
    expectVisibleBillingNote: false,
  },
  {
    toolName: "get_cloudwatch_alarm_summary",
    setupMocks: () => {
      mockFetch.mockResolvedValue(
        cwAlarmsResponse([
          {
            AlarmName: "HighCPU",
            StateValue: "ALARM",
            StateReason: "Threshold Crossed",
            StateUpdatedTimestamp: "2026-06-19T12:00:00.000Z",
            Namespace: "AWS/EC2",
            MetricName: "CPUUtilization",
          },
        ]),
      );
    },
    args: { region: "us-east-1", limit: 10 },
    billingExpect: {
      costClass: "fanout-sensitive",
      pricingModel: "usage-dependent",
      estimatedCostUsd: 0,
    },
    expectVisibleBillingNote: false,
  },
  {
    toolName: "list_lambda_functions",
    setupMocks: () => {
      mockFetch.mockResolvedValue(lambdaListFunctionsResponse([makeLambdaFunction()]));
    },
    args: { regions: ["us-east-1"] },
    billingExpect: {
      costClass: "fanout-sensitive",
      pricingModel: "usage-dependent",
      estimatedCostUsd: 0,
    },
    expectVisibleBillingNote: false,
  },
  {
    toolName: "list_s3_buckets",
    setupMocks: () => {
      mockFetch.mockResolvedValue(
        s3ListBucketsXml([{ name: "my-bucket", createdAt: "2020-01-01T00:00:00.000Z" }]),
      );
    },
    args: { limit: 10 },
    billingExpect: {
      costClass: "low",
      pricingModel: "none",
      estimatedCostUsd: 0,
    },
    expectVisibleBillingNote: false,
  },
  {
    toolName: "list_log_groups",
    setupMocks: () => {
      mockFetch.mockResolvedValue(logsDescribeLogGroupsResponse([makeLogGroup()]));
    },
    args: { region: "us-east-1", prefix: "/aws/lambda", limit: 20 },
    billingExpect: {
      costClass: "volume-sensitive",
      pricingModel: "usage-dependent",
      estimatedCostUsd: 0,
    },
    expectVisibleBillingNote: false,
  },
  {
    toolName: "aws_account_overview",
    setupMocks: () => {
      mockFetch.mockResolvedValue(
        ec2XmlResponse(describeInstancesXml([instanceXml({ instanceId: "i-overview" })])),
      );
    },
    args: {},
    useAggregatesContext: true,
    billingExpect: {
      costClass: "fanout-sensitive",
      pricingModel: "usage-dependent",
      estimatedCostUsd: 0,
    },
    expectVisibleBillingNote: false,
  },
  {
    toolName: "aws_cost_overview",
    setupMocks: () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          ceResponse([
            makeDayWithGroups("2025-01-01", "2025-02-01", "100.00", [
              { key: "Amazon EC2", amount: "60.00" },
              { key: "Amazon S3", amount: "40.00" },
            ]),
          ]),
        ),
      );
    },
    args: {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
      serviceLimit: 2,
    },
    useAggregatesContext: true,
    billingExpect: {
      costClass: "paid",
      pricingModel: "per-request",
      provider: "aws",
      currency: "USD",
    },
  },
  {
    toolName: "aws_observability_overview",
    setupMocks: () => {
      mockFetch.mockResolvedValue(
        cwAlarmsResponse([
          {
            AlarmName: "HighCPU",
            StateValue: "ALARM",
            StateReason: "Threshold Crossed",
            StateUpdatedTimestamp: "2026-06-19T12:00:00.000Z",
          },
        ]),
      );
    },
    args: {},
    useAggregatesContext: true,
    billingExpect: {
      costClass: "fanout-sensitive",
      pricingModel: "usage-dependent",
      estimatedCostUsd: 0,
    },
    expectVisibleBillingNote: false,
  },
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe("AWS-backed tool execution metadata contract", () => {
  for (const scenario of TOOL_SUCCESS_SCENARIOS) {
    it(`${scenario.toolName} attaches validated structuredContent.execution on success`, async () => {
      scenario.setupMocks();
      const context = scenario.useAggregatesContext ? aggregatesContext : baseContext;
      const result = await invokeTool(scenario.toolName, scenario.args, context);

      expect(result.structuredContent).toBeDefined();
      expect(result.structuredContent).not.toHaveProperty("error");

      const execution = assertPublicExecutionShape(result.structuredContent!.execution);
      expect(execution.billing).toMatchObject(scenario.billingExpect);
      expect(execution.cache).toMatchObject({
        enabled: expect.any(Boolean),
        status: expect.any(String),
      });
      expect(execution.awsRequests.length).toBeGreaterThan(0);
      assertExecutionSanitized(execution);

      if (scenario.expectVisibleBillingNote === false) {
        expect(contentText(result)).not.toContain("Billing note:");
      }
    });
  }

  for (const toolName of PAID_TOOLS) {
    it(`${toolName} appends a visible billing note on cache miss`, async () => {
      const cePayload =
        toolName === "aws_cost_overview"
          ? makeDayWithGroups("2025-01-01", "2025-02-01", "100.00", [
              { key: "Amazon EC2", amount: "60.00" },
              { key: "Amazon S3", amount: "40.00" },
            ])
          : makeDayTotal("2025-01-01", "2025-02-01", "42.50");

      mockFetch.mockImplementation(() => Promise.resolve(ceResponse([cePayload])));

      const mockKv = {
        get: vi.fn(async () => null),
        put: vi.fn(),
      } as never;

      const ctxWithCache: GatewayContext = { ...baseContext, cache: mockKv };
      const args =
        toolName === "get_aws_cost_by_service"
          ? {
              startDate: "2025-01-01",
              endDate: "2025-02-01",
              granularity: "MONTHLY",
              limit: 5,
            }
          : toolName === "aws_cost_overview"
            ? {
                startDate: "2025-01-01",
                endDate: "2025-02-01",
                granularity: "MONTHLY",
                serviceLimit: 2,
              }
            : {
                startDate: "2025-01-01",
                endDate: "2025-02-01",
                granularity: "MONTHLY",
              };

      const context =
        toolName === "aws_cost_overview"
          ? { ...aggregatesContext, cache: mockKv }
          : ctxWithCache;

      const result = await invokeTool(toolName, args, context);
      const execution = assertPublicExecutionShape(result.structuredContent!.execution);

      expect(execution.cache.status).toBe("miss");
      expect(execution.billing.charged).toBe(true);
      const expectedCostUsd = toolName === "aws_cost_overview" ? 0.02 : 0.01;
      expect(execution.billing.estimatedCostUsd).toBe(expectedCostUsd);
      expect(execution.awsRequests.some((request) => request.estimatedUnitCostUsd === 0.01)).toBe(
        true,
      );
      expect(contentText(result)).toContain("Billing note:");
      expect(contentText(result)).toContain(`US$ ${expectedCostUsd.toFixed(2)}`);
    });
  }

  for (const toolName of NON_AWS_TOOLS) {
    it(`${toolName} does not attach structuredContent.execution`, async () => {
      const args =
        toolName === "search"
          ? { query: "ec2" }
          : toolName === "fetch"
            ? { id: "tool/get_cloudwatch_alarms" }
            : {};

      const result = await invokeTool(toolName, args);
      expect(result.structuredContent).toBeDefined();
      expect(result.structuredContent).not.toHaveProperty("execution");
    });
  }

  it("does not attach execution metadata on validation failure", async () => {
    const result = await invokeTool("get_aws_cost_summary", {
      startDate: "invalid",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error" },
    });
    expect(result.structuredContent).not.toHaveProperty("execution");
  });
});
