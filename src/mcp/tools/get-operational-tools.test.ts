import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";

const { mockFetch, mockResolve } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockResolve: vi.fn(),
}));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const assumedCredentials = {
  accessKeyId: "ASIATEST",
  secretAccessKey: "assumed-secret",
  sessionToken: "session-token",
  source: "assume-role" as const,
};

const testContext = createTestGatewayContext({
  toolExposure: {
    ...createTestGatewayContext().toolExposure,
    enabledToolPacks: new Set([
      "core",
      "cost",
      "inventory",
      "observability",
      "database",
      "security",
    ]),
  },
  credentialResolver: {
    resolve: mockResolve,
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

beforeEach(() => {
  mockFetch.mockReset();
  mockResolve.mockReset();
  mockResolve.mockResolvedValue(assumedCredentials);
});

describe("get_ses_configuration_status tool", () => {
  it("uses default gateway credentials only", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ConfigurationSetName: "prod-mail",
            SendingOptions: { SendingEnabled: true },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ EventDestinations: [] }), { status: 200 }),
      );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_ses_configuration_status");
    const result = await mock.getTool("get_ses_configuration_status")!.handler({
      configurationSetName: "prod-mail",
    }) as { structuredContent: Record<string, unknown> };

    expect(mockResolve).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      configurationSetExists: true,
      sendingEnabled: true,
    });
  });

  it("rejects disallowed regions before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_ses_configuration_status");
    const result = await mock.getTool("get_ses_configuration_status")!.handler({
      configurationSetName: "prod-mail",
      region: "eu-west-1",
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("get_sns_topic_status tool", () => {
  it("returns masked subscription endpoints", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          `<?xml version="1.0"?><GetTopicAttributesResponse><GetTopicAttributesResult><Attributes></Attributes></GetTopicAttributesResult></GetTopicAttributesResponse>`,
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<?xml version="1.0"?><ListSubscriptionsByTopicResponse><ListSubscriptionsByTopicResult><Subscriptions><member><Protocol>email</Protocol><Endpoint>ops@company.com</Endpoint><SubscriptionArn>arn:aws:sns:us-east-1:123456789012:ops:sub</SubscriptionArn><PendingConfirmation>false</PendingConfirmation></member></Subscriptions></ListSubscriptionsByTopicResult></ListSubscriptionsByTopicResponse>`,
          { status: 200 },
        ),
      );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_sns_topic_status");
    const result = await mock.getTool("get_sns_topic_status")!.handler({
      topicArn: "arn:aws:sns:us-east-1:123456789012:ops",
    }) as { structuredContent: { subscriptions: Array<{ endpointMasked: string }> } };

    expect(result.structuredContent.subscriptions[0].endpointMasked).toBe("o***@company.com");
  });
});

describe("get_eventbridge_rules_status tool", () => {
  it("omits raw target input payloads", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Rules: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Schedules: [] }), { status: 200 }),
      );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_eventbridge_rules_status");
    const result = await mock.getTool("get_eventbridge_rules_status")!.handler({}) as {
      structuredContent: Record<string, unknown>;
    };

    expect(JSON.stringify(result.structuredContent)).not.toContain("Input");
  });
});

describe("get_budget_status tool", () => {
  it("returns budget not found", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ Budgets: [] }), { status: 200 }),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_budget_status");
    const result = await mock.getTool("get_budget_status")!.handler({
      budgetName: "monthly",
      accountId: "123456789012",
    }) as { structuredContent: Record<string, unknown> };

    expect(result.structuredContent).toMatchObject({ budgetExists: false });
  });
});
