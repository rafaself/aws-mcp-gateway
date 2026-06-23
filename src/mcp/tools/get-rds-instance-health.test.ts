import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const singleRegionContext = createTestGatewayContext({ allowedRegions: ["us-east-1"] });

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

function rdsXmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

function describeDbInstancesXml(instances: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<DescribeDBInstancesResponse xmlns="http://rds.amazonaws.com/doc/2014-10-31/">
  <DescribeDBInstancesResult>
    <DBInstances>
${instances}
    </DBInstances>
  </DescribeDBInstancesResult>
</DescribeDBInstancesResponse>`;
}

const dbInstanceXml = `      <DBInstance>
        <DBInstanceIdentifier>my-db</DBInstanceIdentifier>
        <DBInstanceStatus>available</DBInstanceStatus>
        <Engine>postgres</Engine>
        <EngineVersion>15.4</EngineVersion>
        <DBInstanceClass>db.t3.micro</DBInstanceClass>
        <AllocatedStorage>20</AllocatedStorage>
        <StorageEncrypted>true</StorageEncrypted>
        <PubliclyAccessible>false</PubliclyAccessible>
        <MultiAZ>true</MultiAZ>
        <BackupRetentionPeriod>7</BackupRetentionPeriod>
        <DeletionProtection>true</DeletionProtection>
        <Endpoint>
          <Address>secret-host.rds.amazonaws.com</Address>
          <Port>5432</Port>
        </Endpoint>
        <MasterUsername>admin</MasterUsername>
      </DBInstance>`;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("get_rds_instance_health tool", () => {
  it("returns structured health on success without secrets", async () => {
    mockFetch.mockResolvedValue(rdsXmlResponse(describeDbInstancesXml(dbInstanceXml)));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_rds_instance_health");
    const result = await mock.getTool("get_rds_instance_health")!.handler({
      dbInstanceIdentifier: "my-db",
      region: "us-east-1",
    }) as Record<string, unknown>;

    expect(result.structuredContent).toMatchObject({
      dbInstanceIdentifier: "my-db",
      status: "available",
      engine: "postgres",
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain("secret-host");
    expect(JSON.stringify(result.structuredContent)).not.toContain("admin");
  });

  it("rejects disallowed region before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_rds_instance_health");
    const result = await mock.getTool("get_rds_instance_health")!.handler({
      dbInstanceIdentifier: "my-db",
      region: "eu-west-1",
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("maps missing instance to not_found", async () => {
    mockFetch.mockResolvedValue(rdsXmlResponse(describeDbInstancesXml("")));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_rds_instance_health");
    const result = await mock.getTool("get_rds_instance_health")!.handler({
      dbInstanceIdentifier: "missing-db",
      region: "us-east-1",
    }) as { isError?: boolean; structuredContent?: { error?: { code?: string } } };

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "not_found", retryable: false },
    });
  });
});
