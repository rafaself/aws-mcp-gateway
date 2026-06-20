export function ec2XmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

export interface InstanceXmlOpts {
  instanceId?: string;
  state?: string;
  instanceType?: string;
  launchTime?: string;
  availabilityZone?: string;
  ipAddress?: string;
  privateIpAddress?: string;
  name?: string;
  /** When set, only these tags appear (replaces default Name tag). Empty array = tagSet present but empty item list. */
  tags?: Array<{ key: string; value: string }>;
  /** When true, the entire tagSet element is omitted */
  noTagSet?: boolean;
  /** When true, placement element is omitted */
  noPlacement?: boolean;
}

function xmlTag(name: string, value: string | undefined, indent: number): string {
  if (value === undefined) return "";
  return `${" ".repeat(indent)}<${name}>${value}</${name}>\n`;
}

export function instanceXml(opts?: InstanceXmlOpts): string {
  const id = opts?.instanceId ?? "i-0abcd1234efgh5678";
  const state = opts?.state ?? "running";
  const instType = opts?.instanceType ?? "t3.micro";
  const launchTime = opts?.launchTime ?? "2026-06-01T12:00:00.000Z";

  let xml = `          <item>\n`;
  xml += xmlTag("instanceId", id, 12);
  xml += `            <instanceState>\n`;
  xml += xmlTag("name", state, 14);
  xml += `            </instanceState>\n`;
  xml += xmlTag("instanceType", instType, 12);
  xml += xmlTag("launchTime", launchTime, 12);

  if (!opts?.noPlacement) {
    const az = opts?.availabilityZone ?? "us-east-1a";
    xml += `            <placement>\n`;
    xml += xmlTag("availabilityZone", az, 14);
    xml += `            </placement>\n`;
  }

  const hasIp = opts && "ipAddress" in opts;
  const hasPrivateIp = opts && "privateIpAddress" in opts;
  const ip = hasIp ? opts!.ipAddress : "203.0.113.10";
  const privateIp = hasPrivateIp ? opts!.privateIpAddress : "10.0.0.10";
  if (ip !== undefined) xml += xmlTag("ipAddress", ip, 12);
  if (privateIp !== undefined) xml += xmlTag("privateIpAddress", privateIp, 12);

  if (!opts?.noTagSet) {
    const tags = opts?.tags;
    xml += `            <tagSet>\n`;
    if (tags && tags.length > 0) {
      for (const t of tags) {
        xml += `              <item>\n`;
        xml += xmlTag("key", t.key, 16);
        xml += xmlTag("value", t.value, 16);
        xml += `              </item>\n`;
      }
    } else if (!tags) {
      const name = opts?.name ?? "test-instance";
      xml += `              <item>\n`;
      xml += xmlTag("key", "Name", 16);
      xml += xmlTag("value", name, 16);
      xml += `              </item>\n`;
    }
    xml += `            </tagSet>\n`;
  }

  xml += `          </item>`;
  return xml;
}

export function describeInstancesXml(instanceXmls: string[]): string {
  if (instanceXmls.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<DescribeInstancesResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">
  <requestId>abc-123</requestId>
  <reservationSet/>
</DescribeInstancesResponse>`;
  }

  const items = instanceXmls.join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<DescribeInstancesResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">
  <requestId>abc-123</requestId>
  <reservationSet>
    <item>
      <reservationId>r-12345678</reservationId>
      <ownerId>123456789012</ownerId>
      <instancesSet>
${items}
      </instancesSet>
    </item>
  </reservationSet>
</DescribeInstancesResponse>`;
}

export function ceResponse(resultsByTime: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify({ ResultsByTime: resultsByTime }), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

export function makeDayTotal(
  start: string,
  end: string,
  amount: string,
  unit = "USD",
  metric = "UnblendedCost",
) {
  return {
    TimePeriod: { Start: start, End: end },
    Total: { [metric]: { Amount: amount, Unit: unit } },
  };
}

export function cwAlarmsResponse(
  alarms: Array<Record<string, unknown>>,
  nextToken?: string,
  includeComposite = false,
): Response {
  const body: Record<string, unknown> = {};
  if (!includeComposite) {
    body.MetricAlarms = alarms;
  } else {
    body.CompositeAlarms = alarms;
  }
  if (nextToken) {
    body.NextToken = nextToken;
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

export function logsFilterEventsResponse(
  events: Array<Record<string, unknown>>,
  nextToken?: string,
): Response {
  const body: Record<string, unknown> = { events };
  if (nextToken) body.nextToken = nextToken;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

export function makeDayWithGroups(
  start: string,
  end: string,
  totalAmount: string,
  groups: Array<{ key: string; amount: string }>,
  unit = "USD",
  metric = "UnblendedCost",
) {
  return {
    TimePeriod: { Start: start, End: end },
    Total: { [metric]: { Amount: totalAmount, Unit: unit } },
    Groups: groups.map((g) => ({
      Keys: [g.key],
      Metrics: { [metric]: { Amount: g.amount, Unit: unit } },
    })),
  };
}
