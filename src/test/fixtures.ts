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

export function lambdaListFunctionsResponse(
  functions: Array<Record<string, unknown>>,
): Response {
  return new Response(JSON.stringify({ Functions: functions }), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.0" },
  });
}

export function makeLambdaFunction(opts?: {
  functionName?: string;
  runtime?: string;
  state?: string;
  memorySize?: number;
}): Record<string, unknown> {
  return {
    FunctionName: opts?.functionName ?? "my-function",
    Runtime: opts?.runtime ?? "python3.12",
    State: opts?.state ?? "Active",
    MemorySize: opts?.memorySize ?? 128,
    LastModified: "2026-01-01T00:00:00.000+0000",
  };
}

export function s3ListBucketsXml(
  buckets: Array<{ name: string; createdAt: string }>,
): Response {
  const bucketXml = buckets
    .map(
      (b) =>
        `    <Bucket>\n      <Name>${b.name}</Name>\n      <CreationDate>${b.createdAt}</CreationDate>\n    </Bucket>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Owner>
    <ID>abc123</ID>
    <DisplayName>owner</DisplayName>
  </Owner>
  <Buckets>
${bucketXml}
  </Buckets>
</ListAllMyBucketsResult>`;

  return new Response(xml, {
    status: 200,
    headers: { "content-type": "application/xml" },
  });
}

export function logsDescribeLogGroupsResponse(
  logGroups: Array<Record<string, unknown>>,
  nextToken?: string,
): Response {
  const body: Record<string, unknown> = { logGroups };
  if (nextToken) body.nextToken = nextToken;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

export function logsDescribeLogStreamsResponse(
  logStreams: Array<Record<string, unknown>>,
  nextToken?: string,
): Response {
  const body: Record<string, unknown> = { logStreams };
  if (nextToken) body.nextToken = nextToken;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

export function makeLogGroup(opts?: {
  logGroupName?: string;
  creationTime?: number;
}): Record<string, unknown> {
  return {
    logGroupName: opts?.logGroupName ?? "/aws/lambda/example",
    creationTime: opts?.creationTime ?? 1718798400000,
    retentionInDays: 30,
    storedBytes: 1024,
  };
}

export function ecsJsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

export function makeEcsCluster(opts?: { clusterName?: string; status?: string }) {
  return {
    clusterName: opts?.clusterName ?? "my-cluster",
    status: opts?.status ?? "ACTIVE",
  };
}

export function makeEcsService(opts?: {
  serviceName?: string;
  desiredCount?: number;
  runningCount?: number;
  pendingCount?: number;
  taskDefinition?: string;
  launchType?: string;
}) {
  return {
    serviceName: opts?.serviceName ?? "my-service",
    status: "ACTIVE",
    desiredCount: opts?.desiredCount ?? 2,
    runningCount: opts?.runningCount ?? 2,
    pendingCount: opts?.pendingCount ?? 0,
    taskDefinition:
      opts?.taskDefinition ??
      "arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:42",
    launchType: opts?.launchType ?? "FARGATE",
    capacityProviderStrategy: [{ capacityProvider: "FARGATE" }],
    deployments: [
      {
        status: "PRIMARY",
        rolloutState: "COMPLETED",
        desiredCount: opts?.desiredCount ?? 2,
        runningCount: opts?.runningCount ?? 2,
        pendingCount: opts?.pendingCount ?? 0,
      },
    ],
    events: [
      {
        id: "evt-1",
        createdAt: "2026-06-01T12:00:00.000Z",
        message: "(service my-service) has reached a steady state.",
      },
    ],
  };
}

export function makeEcsTask(opts?: {
  taskArn?: string;
  taskDefinitionArn?: string;
  lastStatus?: string;
  desiredStatus?: string;
  stoppedAt?: string;
  stopCode?: string;
  stoppedReason?: string;
}) {
  const taskId = "abc123def456";
  return {
    taskArn:
      opts?.taskArn ??
      `arn:aws:ecs:us-east-1:123456789012:task/my-cluster/${taskId}`,
    taskDefinitionArn:
      opts?.taskDefinitionArn ??
      "arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:42",
    lastStatus: opts?.lastStatus ?? "RUNNING",
    desiredStatus: opts?.desiredStatus ?? "RUNNING",
    healthStatus: "HEALTHY",
    startedAt: "2026-06-01T10:00:00.000Z",
    ...(opts?.stoppedAt ? { stoppedAt: opts.stoppedAt } : {}),
    ...(opts?.stopCode ? { stopCode: opts.stopCode } : {}),
    ...(opts?.stoppedReason ? { stoppedReason: opts.stoppedReason } : {}),
    availabilityZone: "us-east-1a",
    containers: [
      {
        name: "app",
        lastStatus: opts?.lastStatus ?? "RUNNING",
        ...(opts?.stopCode ? { exitCode: 1, reason: "Error" } : {}),
      },
    ],
  };
}

export function makeEcsTaskWithImage(opts?: {
  image?: string;
  imageDigest?: string;
  taskArn?: string;
}) {
  const task = makeEcsTask({ taskArn: opts?.taskArn });
  const container = task.containers[0] as {
    name: string;
    lastStatus: string;
    image?: string;
    imageDigest?: string;
  };
  if (opts?.image) container.image = opts.image;
  if (opts?.imageDigest) container.imageDigest = opts.imageDigest;
  return task;
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

export function ecrJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

export function ecrErrorResponse(errorType: string, status = 400): Response {
  return ecrJsonResponse({ __type: errorType, message: errorType }, status);
}

export function makeEcrImageDetail(opts?: {
  digest?: string;
  tags?: string[];
  pushedAt?: number;
  scanStatus?: string;
}) {
  return {
    imageDigest: opts?.digest ?? "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    imageTags: opts?.tags ?? ["latest"],
    imagePushedAt: opts?.pushedAt ?? 1718798400000,
    imageSizeInBytes: 123456789,
    imageScanStatus: { status: opts?.scanStatus ?? "COMPLETE" },
    imageScanFindingSummary: { CRITICAL: 0, HIGH: 1 },
  };
}

export function s3XmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/xml" },
  });
}

export function s3ErrorXml(code: string, status = 404): Response {
  return s3XmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`,
    status,
  );
}

export function s3BucketLocationXml(region = "us-west-2"): string {
  if (region === "us-east-1") {
    return '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>';
  }
  return `<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${region}</LocationConstraint>`;
}
