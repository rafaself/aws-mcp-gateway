import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertInstanceExists, getInstanceHealth } from "./client.js";
import type { AwsCredentials } from "../types.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const credentials: AwsCredentials = {
  accessKeyId: "AKIA-test-key",
  secretAccessKey: "test-secret",
};

function rdsXmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

function describeDbInstancesXml(instances: string[]): string {
  const body = instances.join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<DescribeDBInstancesResponse xmlns="http://rds.amazonaws.com/doc/2014-10-31/">
  <DescribeDBInstancesResult>
    <DBInstances>
${body}
    </DBInstances>
  </DescribeDBInstancesResult>
</DescribeDBInstancesResponse>`;
}

function dbInstanceXml(opts: {
  identifier?: string;
  subnetGroupName?: string | null;
}): string {
  const id = opts.identifier ?? "my-db";
  const subnetBlock =
    opts.subnetGroupName === null
      ? ""
      : `        <DBSubnetGroup>
          <DBSubnetGroupName>${opts.subnetGroupName ?? "default-vpc"}</DBSubnetGroupName>
        </DBSubnetGroup>
`;
  return `      <DBInstance>
        <DBInstanceIdentifier>${id}</DBInstanceIdentifier>
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
${subnetBlock}        <Endpoint>
          <Address>${id}.secret-host.rds.amazonaws.com</Address>
          <Port>5432</Port>
        </Endpoint>
        <MasterUsername>admin</MasterUsername>
      </DBInstance>`;
}

function describeDbSubnetGroupsXml(vpcId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<DescribeDBSubnetGroupsResponse xmlns="http://rds.amazonaws.com/doc/2014-10-31/">
  <DescribeDBSubnetGroupsResult>
    <DBSubnetGroups>
      <DBSubnetGroup>
        <DBSubnetGroupName>default-vpc</DBSubnetGroupName>
        <VpcId>${vpcId}</VpcId>
      </DBSubnetGroup>
    </DBSubnetGroups>
  </DescribeDBSubnetGroupsResult>
</DescribeDBSubnetGroupsResponse>`;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("getInstanceHealth", () => {
  it("returns normalized health and enriches subnet group vpc", async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const body = init.body?.toString() ?? "";
      if (body.includes("Action=DescribeDBSubnetGroups")) {
        return Promise.resolve(rdsXmlResponse(describeDbSubnetGroupsXml("vpc-abc")));
      }
      return Promise.resolve(
        rdsXmlResponse(describeDbInstancesXml([dbInstanceXml({ identifier: "my-db" })])),
      );
    });

    const health = await getInstanceHealth("my-db", "us-east-1", credentials);

    expect(health).toMatchObject({
      dbInstanceIdentifier: "my-db",
      status: "available",
      vpcId: "vpc-abc",
      dbSubnetGroupName: "default-vpc",
    });
    expect(JSON.stringify(health)).not.toContain("secret-host");
    expect(JSON.stringify(health)).not.toContain("admin");
  });

  it("throws not_found when instance is missing", async () => {
    mockFetch.mockResolvedValue(rdsXmlResponse(describeDbInstancesXml([])));

    await expect(
      getInstanceHealth("missing-db", "us-east-1", credentials),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("sends DescribeDBInstances with identifier filter", async () => {
    mockFetch.mockResolvedValue(
      rdsXmlResponse(describeDbInstancesXml([dbInstanceXml({ identifier: "prod-db", subnetGroupName: null })])),
    );

    await getInstanceHealth("prod-db", "us-east-1", credentials);

    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain("Action=DescribeDBInstances");
    expect(body).toContain("DBInstanceIdentifier.1=prod-db");
  });
});

describe("assertInstanceExists", () => {
  it("succeeds when instance exists", async () => {
    mockFetch.mockResolvedValue(
      rdsXmlResponse(describeDbInstancesXml([dbInstanceXml({ identifier: "my-db", subnetGroupName: null })])),
    );

    await expect(
      assertInstanceExists("my-db", "us-east-1", credentials),
    ).resolves.toBeUndefined();
  });
});
