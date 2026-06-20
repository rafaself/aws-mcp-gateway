import { describe, it, expect } from "vitest";
import { parseEc2Response } from "./xml.js";
import { describeInstancesXml, instanceXml } from "../../test/fixtures.js";

describe("parseEc2Response", () => {
  it("parses a realistic DescribeInstances XML response", () => {
    const xml = describeInstancesXml([
      instanceXml({
        instanceId: "i-0abcd1234efgh5678",
        state: "running",
        instanceType: "t3.micro",
        availabilityZone: "us-east-1a",
        ipAddress: "203.0.113.10",
        privateIpAddress: "10.0.0.10",
      }),
    ]);

    const result = parseEc2Response(xml);

    expect(result.DescribeInstancesResponse).toBeDefined();
    const reservations =
      result.DescribeInstancesResponse!.reservationSet!.item!;
    expect(reservations).toHaveLength(1);
    expect(reservations[0].reservationId).toBe("r-12345678");
    expect(reservations[0].ownerId).toBe("123456789012");

    const instances = reservations[0].instancesSet!.item!;
    expect(instances).toHaveLength(1);
    expect(instances[0].instanceId).toBe("i-0abcd1234efgh5678");
    expect(instances[0].instanceState!.name).toBe("running");
    expect(instances[0].instanceType).toBe("t3.micro");
    expect(instances[0].launchTime).toBe("2026-06-01T12:00:00.000Z");
    expect(instances[0].placement!.availabilityZone).toBe("us-east-1a");
    expect(instances[0].ipAddress).toBe("203.0.113.10");
    expect(instances[0].privateIpAddress).toBe("10.0.0.10");
  });

  it("parses instances with Name tag", () => {
    const xml = describeInstancesXml([
      instanceXml({
        instanceId: "i-11111111",
        name: "web-server-01",
      }),
    ]);

    const result = parseEc2Response(xml);
    const instance = result.DescribeInstancesResponse!.reservationSet!.item![0].instancesSet!.item![0];
    const tags = instance.tagSet!.item!;
    expect(tags).toHaveLength(1);
    expect(tags[0].key).toBe("Name");
    expect(tags[0].value).toBe("web-server-01");
  });

  it("parses instances with multiple tags", () => {
    const xml = describeInstancesXml([
      instanceXml({
        tags: [
          { key: "Name", value: "web-01" },
          { key: "Environment", value: "production" },
        ],
      }),
    ]);

    const result = parseEc2Response(xml);
    const instance = result.DescribeInstancesResponse!.reservationSet!.item![0].instancesSet!.item![0];
    const tags = instance.tagSet!.item!;
    expect(tags).toHaveLength(2);
    expect(tags[0].key).toBe("Name");
    expect(tags[0].value).toBe("web-01");
    expect(tags[1].key).toBe("Environment");
    expect(tags[1].value).toBe("production");
  });

  it("handles empty reservationSet (no instances)", () => {
    const xml = describeInstancesXml([]);

    const result = parseEc2Response(xml);

    expect(result.DescribeInstancesResponse).toBeDefined();
    expect(
      result.DescribeInstancesResponse!.reservationSet!.item,
    ).toBeUndefined();
  });

  it("handles response with no reservationSet element", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DescribeInstancesResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">
  <requestId>abc-123</requestId>
</DescribeInstancesResponse>`;

    const result = parseEc2Response(xml);

    expect(result.DescribeInstancesResponse).toBeDefined();
    expect(
      result.DescribeInstancesResponse!.reservationSet,
    ).toBeUndefined();
  });

  it("handles empty string", () => {
    const result = parseEc2Response("");

    expect(result.DescribeInstancesResponse).toBeUndefined();
  });

  it("handles instances without tagSet element", () => {
    const noTagsXml = `<?xml version="1.0" encoding="UTF-8"?>
<DescribeInstancesResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">
  <requestId>abc-123</requestId>
  <reservationSet>
    <item>
      <reservationId>r-12345678</reservationId>
      <ownerId>123456789012</ownerId>
      <instancesSet>
        <item>
          <instanceId>i-11111111</instanceId>
          <instanceState>
            <name>running</name>
          </instanceState>
          <instanceType>t3.micro</instanceType>
        </item>
      </instancesSet>
    </item>
  </reservationSet>
</DescribeInstancesResponse>`;

    const result = parseEc2Response(noTagsXml);
    const instance = result.DescribeInstancesResponse!.reservationSet!.item![0].instancesSet!.item![0];
    expect(instance.tagSet).toBeUndefined();
  });

  it("handles instances without placement element", () => {
    const xml = describeInstancesXml([
      instanceXml({ noPlacement: true }),
    ]);

    const result = parseEc2Response(xml);
    const instance = result.DescribeInstancesResponse!.reservationSet!.item![0].instancesSet!.item![0];
    expect(instance.placement).toBeUndefined();
  });
});
