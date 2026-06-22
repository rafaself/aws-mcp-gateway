# MCP Tool Contracts

This document defines the public contract for every MCP tool exposed by the
gateway. It is the authoritative reference for input validation, output shape,
error behavior, caching, region handling, and safety boundaries.

**Contract rules:**

- `structuredContent` is the stable machine-readable contract. Human-readable
  `text` is secondary and non-authoritative.
- All normalized outputs are documented. Raw AWS response fields are never
  exposed.
- Every tool is read-only. Write and management operations are out of scope for
  the current read-only scope.
- Invalid input always fails before any downstream AWS call.
- The central policy gate may deny a tool call before AWS work (normalized `validation_error`) when packs are disabled, cost-control limits are exceeded, or exposure configuration hides the tool.
- Generic AWS access (arbitrary API proxy or CLI execution) is outside scope.

**IAM mapping:** See [aws-capability-matrix.md](aws-capability-matrix.md) for the authoritative tool-to-IAM action matrix.

**ChatGPT connector:** ChatGPT discovers public actions through authenticated `tools/list`. Tools `search` and `fetch` implement the OpenAI MCP catalog schema — they help inspect the AWS tool catalog but do not replace `tools/list` action discovery. Neither `search` nor `fetch` calls AWS directly (except `fetch` may embed live `get_gateway_status` JSON for that catalog entry). See [chatgpt-connector.md](chatgpt-connector.md).

---

## Tool index

| # | Tool | Role | Calls AWS | Page |
|---|------|------|-----------|------|
| — | `search` | Catalog search helper | No | [↓](#search-chatgpt-discovery) |
| — | `fetch` | Catalog document helper | No* | [↓](#fetch-chatgpt-discovery) |
| 1 | `get_gateway_status` | Health check | No | [↓](#1-get_gateway_status) |
| 2 | `get_aws_cost_summary` | Cost total | Yes | [↓](#2-get_aws_cost_summary) |
| 3 | `get_aws_cost_by_service` | Cost by service | Yes | [↓](#3-get_aws_cost_by_service) |
| 4 | `list_ec2_instances` | EC2 inventory | Yes | [↓](#4-list_ec2_instances) |
| 5 | `get_cloudwatch_alarms` | Alarm states | Yes | [↓](#5-get_cloudwatch_alarms) |
| 6 | `get_recent_log_errors` | Recent log errors | Yes | [↓](#6-get_recent_log_errors) |
| 7 | `list_lambda_functions` | Lambda inventory | Yes | [↓](#7-list_lambda_functions) |
| 8 | `list_s3_buckets` | S3 bucket inventory | Yes | [↓](#8-list_s3_buckets) |
| 9 | `list_log_groups` | Log group inventory | Yes | [↓](#9-list_log_groups) |
| 10 | `aws_account_overview` | Bounded account summary | Yes | [↓](#10-aws_account_overview) |
| 11 | `aws_cost_overview` | Bounded cost summary | Yes | [↓](#11-aws_cost_overview) |
| 12 | `aws_observability_overview` | Bounded observability summary | Yes | [↓](#12-aws_observability_overview) |

\* `fetch` does not call AWS except when embedding live `get_gateway_status` JSON for that catalog entry.

All public tools require OAuth (`aws:read`) or local bearer authentication and are read-only.

**Aggregate overview tools (10–12)** compose existing manifest-backed capabilities into bounded summaries. They are in the `aggregates` tool pack, which is **disabled by default**. Enable with `AWS_MCP_ENABLED_TOOL_PACKS=core,cost,inventory,observability,aggregates` when you want higher-level summaries instead of calling each inventory or observability tool separately. Aggregates are not full account crawlers — they return counts and short normalized samples only.

---

## `search` (ChatGPT discovery)

**Purpose:** Lets ChatGPT discover read-only AWS MCP tools by natural-language query. Does not call AWS.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | yes | Search terms (for example `cost`, `ec2`, `logs`) |

### Output (`structuredContent`)

```json
{
  "results": [
    {
      "id": "tool/list_ec2_instances",
      "title": "List EC2 Instances",
      "url": "https://<worker-host>/mcp#tool=list_ec2_instances"
    }
  ]
}
```

### Security

- `securitySchemes`: `oauth2` (`aws:read`) only — matches global `/mcp` authentication.
- `readOnlyHint`: true; `openWorldHint`: false.

---

## `fetch` (ChatGPT discovery)

**Purpose:** Returns full documentation for a catalog id from `search`. Does not call AWS (except embedding live `get_gateway_status` JSON when fetching that tool).

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Catalog id (prefix `tool/`, e.g. `tool/get_aws_cost_summary`) |

### Output (`structuredContent`)

```json
{
  "id": "tool/get_aws_cost_summary",
  "title": "Get AWS Cost Summary",
  "text": "# AWS cost summary\n\n...",
  "url": "https://<worker-host>/mcp#tool=get_aws_cost_summary",
  "metadata": {
    "mcpTool": "get_aws_cost_summary",
    "docsUrl": "https://github.com/rafaself/aws-mcp-gateway/blob/main/docs/mcp-tools.md#2-get_aws_cost_summary",
    "readOnly": "true",
    "awsService": "ce"
  }
}
```

### Errors

- Unknown `id` → `validation_error` before any AWS call.

### Security

- `securitySchemes`: `oauth2` (`aws:read`) only.
- `readOnlyHint`: true; `openWorldHint`: false.

---

## 1. `get_gateway_status`

**Purpose:** Returns the current gateway status. Use this to verify the MCP
server is running without making any AWS calls.

### Input

No parameters.

### Behavior

- Requires a valid MCP session on `/mcp` (local bearer token or OAuth access token with `aws:read` scope).
- Advertises OAuth `securitySchemes` and read-only annotations in the tool descriptor.
- Makes no AWS calls.
- Always succeeds when invoked with valid MCP authentication.

### Output (`structuredContent`)

```json
{
  "service": "aws-mcp-gateway",
  "status": "ok",
  "mode": "read-only"
}
```

Human-readable `content[0].text` mirrors the same JSON payload.

### Output schema

The tool descriptor declares `outputSchema` matching the `structuredContent` shape above (`service`, `status`, `mode` strings).

### Error codes

None — the handler always returns a successful response.

### Safety boundaries

- This tool is purely informational. It has no side effects.
- The `mode` field always reads `"read-only"` to reinforce the gateway's
  security posture.

---

## 2. `get_aws_cost_summary`

**Purpose:** Returns the total AWS cost for a given time period via Cost
Explorer.

### Input

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `startDate` | `string` | yes | — | Must match `YYYY-MM-DD`, valid calendar date, not in the future. |
| `endDate` | `string` | yes | — | Must match `YYYY-MM-DD`, valid calendar date, not in the future, after `startDate`. |
| `granularity` | `"DAILY"` \| `"MONTHLY"` | no | `"MONTHLY"` | Must be one of the two values. |

**Additional validation (server-side, after Zod checks):**

- `startDate` must be before `endDate`.
- Neither date may be in the future.
- Date range must not exceed **90 days** (`COST_MAX_DATE_RANGE_DAYS`).

### Region behavior

- Always signs requests to `us-east-1` (Cost Explorer is a global API). The
  tool does not accept a region parameter.
- The `ctx.region` value is used for signing but Cost Explorer is always a
  global `us-east-1` call.

### AWS API

- **Service:** Cost Explorer (`ce`)
- **Target:** `AWSInsightsIndexService.GetCostAndUsage`
- **Metric:** `UnblendedCost` (hard-coded, not configurable by the caller)
- **Request body variant:** No `GroupBy` — returns a single total per time
  period.

### Cache behavior

| Property | Value |
|----------|-------|
| Cached | Yes |
| Key components | `startDate`, `endDate`, `granularity`, `metric` (always `UnblendedCost`) |
| TTL | 1800 seconds (30 minutes) — the KV default |
| Cache miss | Calls AWS, then stores the normalized result |
| AWS failure | Result is **not** cached |
| Cache absent | Works without caching when `AWS_MCP_CACHE` is not configured |

### Output

```typescript
{
  content: [
    {
      type: "text",
      text: string, // e.g. "AWS cost from 2025-01-01 to 2025-01-31 is 1234.56 USD."
    }
  ],
  structuredContent: {
    period: {
      startDate: string, // YYYY-MM-DD
      endDate: string    // YYYY-MM-DD
    },
    granularity: "DAILY" | "MONTHLY",
    total: number,       // e.g. 1234.56
    currency: string     // e.g. "USD"
  }
}
```

### Error codes

| Condition | Code | Retryable |
|-----------|------|-----------|
| Invalid date format | `validation_error` | false |
| `startDate` after `endDate` | `validation_error` | false |
| Future date | `validation_error` | false |
| Range > 90 days | `validation_error` | false |
| Invalid granularity | `validation_error` | false |
| AWS API failure | `aws_request_failed` | varies |
| Unknown error | `internal_error` | false |

### Safety boundaries

- No AWS call is made when validation fails.
- Raw `ResultsByTime`, `TimePeriod`, or `UnblendedCost` fields from the AWS
  response are never exposed in the MCP output.
- `UnblendedCost` is the only metric — no other cost metric is exposed.
- Credentials and signed headers are never leaked in error payloads.

---

## 3. `get_aws_cost_by_service`

**Purpose:** Returns AWS costs broken down by service for a given time period
via Cost Explorer.

### Input

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `startDate` | `string` | yes | — | See `get_aws_cost_summary`. |
| `endDate` | `string` | yes | — | See `get_aws_cost_summary`. |
| `granularity` | `"DAILY"` \| `"MONTHLY"` | no | `"MONTHLY"` | Must be one of the two values. |
| `limit` | `number` | no | `10` | Integer, min 1, max **25** (`COST_MAX_SERVICE_ROWS`). |

### Region behavior

Same as `get_aws_cost_summary` — always `us-east-1`.

### AWS API

- **Service:** Cost Explorer (`ce`)
- **Target:** `AWSInsightsIndexService.GetCostAndUsage`
- **Metric:** `UnblendedCost` (hard-coded)
- **Request body variant:** `GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }]`

### Cache behavior

| Property | Value |
|----------|-------|
| Cached | Yes |
| Key components | `startDate`, `endDate`, `granularity`, `metric` |
| TTL | 1800 seconds (30 minutes) |

### Output

```typescript
{
  content: [
    {
      type: "text",
      text: string, // e.g. "AWS cost from 2025-01-01 to 2025-01-31 is 1234.56 USD.\nTop services by cost:\nEC2: 500.00 USD\nS3: 300.00 USD"
    }
  ],
  structuredContent: {
    period: {
      startDate: string, // YYYY-MM-DD
      endDate: string    // YYYY-MM-DD
    },
    granularity: "DAILY" | "MONTHLY",
    total: number,
    currency: string,
    services: [
      { service: string, amount: number }, // sorted by amount descending
      // ... up to `limit` entries
    ]
  }
}
```

### Error codes

Same as `get_aws_cost_summary`, plus:

| Condition | Code | Retryable |
|-----------|------|-----------|
| `limit` out of range (1–25) | `validation_error` | false |

### Safety boundaries

- Same as `get_aws_cost_summary`.
- Services are sorted by cost descending before the `limit` slice is applied.
- The `limit` parameter only controls how many entries are returned to the
  caller; the AWS API is called for all services before filtering.

---

## 4. `list_ec2_instances`

**Purpose:** Lists EC2 instances across regions with optional state and region
filtering.

### Input

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `regions` | `string[]` | no | All allowed regions | Each region must be in the `AWS_ALLOWED_REGIONS` allowlist. |
| `states` | `string[]` | no | All states | Each value must be one of: `pending`, `running`, `stopping`, `stopped`, `shutting-down`, `terminated`. |

### Region behavior

- If `regions` is omitted, all regions in the `AWS_ALLOWED_REGIONS` allowlist
  are queried.
- Each requested region is validated against the allowlist before any AWS call.
- Regions are queried in parallel using `Promise.allSettled`.
- Partial failures are tolerated: data from successful regions is returned. If
  **all** regions fail, the first error is thrown.

### AWS API

- **Service:** EC2 (`ec2`)
- **Action:** `DescribeInstances`
- **API version:** `2016-11-15`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Response format:** XML (parsed via `fast-xml-parser`)
- **Timeout:** 30 seconds per region
- **State filter:** Sent as `Filter.1.Name=instance-state-name` with
  `Filter.1.Value.N={state}` values.

### Cache behavior

| Property | Value |
|----------|-------|
| Cached | Yes |
| Key components | `regions` (sorted), `stateFilter` (sorted) |
| TTL | 300 seconds (5 minutes) |

### Output

```typescript
{
  content: [
    {
      type: "text",
      text: string, // Summary grouped by state and by region
    }
  ],
  structuredContent: {
    regions: string[],        // Sorted unique region names
    count: number,
    instances: [
      {
        instanceId: string,   // e.g. "i-1234567890abcdef0"
        region: string,       // e.g. "us-east-1"
        state: string,        // e.g. "running"
        instanceType: string, // e.g. "t3.micro"
        name: string          // From "Name" tag, empty string if absent
      }
      // Sorted by region, then instanceId
    ]
  }
}
```

### Redacted fields

The following raw EC2 response fields are explicitly **not** included in the
MCP output:

- `launchTime`
- `availabilityZone`
- `publicIpAddress`
- `privateIpAddress`
- `tagSet` (except the `Name` tag which is extracted as `name`)
- `reservationId`
- `ownerId`

### Error codes

| Condition | Code | Retryable |
|-----------|------|-----------|
| Invalid instance state | `validation_error` | false |
| Region not in allowlist | `validation_error` | false |
| AWS request failure (all regions) | `aws_request_failed` | true (on 5xx / timeout) |
| Timeout | `aws_request_failed` | true |
| Unknown error | `internal_error` | false |

### Safety boundaries

- No AWS call if region validation fails.
- No AWS call if a provided state value is invalid.
- Partial region failure is tolerated — usable data from successful regions is
  still returned.
- Instances are sorted deterministically (by region, then instanceId) to
  produce stable output.

---

## 5. `get_cloudwatch_alarms`

**Purpose:** Lists CloudWatch alarms across regions with optional state and
region filtering.

### Input

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `regions` | `string[]` | no | All allowed regions | Each region must be in the `AWS_ALLOWED_REGIONS` allowlist. |
| `states` | `string[]` | no | All states | Each value must be one of: `ALARM`, `INSUFFICIENT_DATA`, `OK`. |

### Region behavior

- Same pattern as `list_ec2_instances`: defaults to all allowed regions,
  allowlist validation, parallel queries, partial failure tolerance.

### AWS API

- **Service:** CloudWatch (`monitoring`)
- **Target:** `GraniteServiceVersion20100801.DescribeAlarms`
- **Pagination:** Handles `NextToken` — fetches all pages.
- **Single state filter:** Sent as `StateValue` in the request body.
- **Multiple state filters:** Applied client-side after retrieving all alarms.
- **Max records per page:** 100 (`MAX_RECORDS`).

### Cache behavior

| Property | Value |
|----------|-------|
| Cached | Yes |
| Key components | `regions` (sorted), `stateFilter` (sorted) |
| TTL | 300 seconds (5 minutes) |

### Output

```typescript
{
  content: [
    {
      type: "text",
      text: string, // Grouped by state: ALARM first, INSUFFICIENT_DATA, then OK
    }
  ],
  structuredContent: {
    regions: string[], // Queried regions list
    count: number,
    alarms: [
      {
        name: string,       // Alarm name
        region: string,     // e.g. "us-east-1"
        state: "ALARM" | "INSUFFICIENT_DATA" | "OK",
        reason: string,     // State reason text
        updatedAt: string   // ISO 8601 timestamp
      }
      // Sorted by state priority (ALARM first), then region, then name
    ]
  }
}
```

### Redacted fields

The raw CloudWatch response includes `namespace` and `metricName` in the
internal type, but these are **not** included in `structuredContent.alarms`
entries. Only `name`, `region`, `state`, `reason`, and `updatedAt` are exposed.

### Error codes

| Condition | Code | Retryable |
|-----------|------|-----------|
| Invalid alarm state | `validation_error` | false |
| Region not in allowlist | `validation_error` | false |
| AWS request failure (all regions) | `aws_request_failed` | varies |
| Unknown error | `internal_error` | false |

### Safety boundaries

- No AWS call if region validation fails.
- No AWS call if a provided state value is invalid.
- Partial region failure is tolerated.
- Alarms are sorted deterministically (ALARM first, then by region, then by
  name).

---

## 6. `get_recent_log_errors`

**Purpose:** Returns recent error, exception, and warning log events from a
CloudWatch log group.

### Input

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `region` | `string` | yes | — | Must be in the `AWS_ALLOWED_REGIONS` allowlist. |
| `logGroupName` | `string` | yes | — | Must be a non-empty, non-whitespace string. |
| `hours` | `number` | no | `1` | Integer, min 1, max **24** (`LOGS_MAX_HOURS`). |
| `limit` | `number` | no | `20` | Integer, min 1, max **50** (`LOGS_MAX_EVENTS`). |

### Region behavior

- Single region (not an array like EC2 / CloudWatch tools).
- Validated against the `AWS_ALLOWED_REGIONS` allowlist before any AWS call.

### AWS API

- **Service:** CloudWatch Logs (`logs`)
- **Target:** `Logs_20140328.FilterLogEvents`
- **Filter pattern (hard-coded):**
  `"?ERROR ?Error ?error ?Exception ?exception ?WARN ?Warn ?warn"`
- **Time range:** `startTime = now - (hours * 3600000)`, `endTime = now`.
- **Message truncation:** Messages longer than **1000 characters**
  (`LOGS_MAX_MESSAGE_LENGTH`) are truncated.

### Cache behavior

| Property | Value |
|----------|-------|
| Cached | Yes |
| Key components | `logGroupName`, `region`, `filterPattern`, `startTime`, `endTime`, `limit` |
| TTL | 300 seconds (5 minutes) |
| Time bucketing | `startTime` and `endTime` are rounded to the nearest cache TTL window (`cacheBucketMs = 300_000`) so that queries within the same window produce the same cache key. |

### Output

```typescript
{
  content: [
    {
      type: "text",
      text: string, // e.g. "Found 5 error log event(s) in /aws/lambda/my-function (us-east-1, last 1h)."
    }
  ],
  structuredContent: {
    region: string,          // e.g. "us-east-1"
    logGroupName: string,    // e.g. "/aws/lambda/my-function"
    count: number,
    events: [
      {
        timestamp: string,     // ISO 8601
        logStreamName: string, // e.g. "2025/01/01/[$LATEST]abc123"
        message: string       // Truncated to 1000 characters
      }
    ]
  }
}
```

### Redacted fields

The following raw CloudWatch Logs response fields are **not** included in the
MCP output:

- `eventId`
- `ingestionTime`

### Error codes

| Condition | Code | Retryable |
|-----------|------|-----------|
| Region not in allowlist | `validation_error` | false |
| Empty `logGroupName` | `validation_error` | false |
| `hours` out of range (1–24) | `validation_error` | false |
| `limit` out of range (1–50) | `validation_error` | false |
| AWS API failure | `aws_request_failed` | varies |
| Unknown error | `internal_error` | false |

### Safety boundaries

- No AWS call if validation fails (region, hours, limit, logGroupName).
- Log messages are truncated to 1000 characters to prevent oversized responses.
- Timestamps are normalized to ISO 8601 strings.
- The filter pattern is fixed and cannot be overridden by the caller.

---

## 7. `list_lambda_functions`

**Purpose:** Lists Lambda functions across allowed regions with optional region
and result limiting.

### Input

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `regions` | `string[]` | no | All allowed regions | Each region must be in `AWS_ALLOWED_REGIONS`. |
| `limit` | `number` | no | 100 | Integer 1–100. |

### Region behavior

Multi-region fanout with partial failure tolerance. Defaults to all allowed
regions when `regions` is omitted.

### AWS API

- **Service:** Lambda
- **Action:** `ListFunctions`
- **Capability:** `lambda:ListFunctions`

### Cache behavior

| Property | Value |
|----------|-------|
| Cached | Yes |
| Key components | `regions` (sorted), `limit` |
| TTL | 300 seconds (5 minutes) |

### Output

```typescript
{
  content: [{ type: "text", text: string }],
  structuredContent: {
    regions: string[],
    count: number,
    functions: [
      {
        functionName: string,
        region: string,
        runtime: string,
        state: string
      }
    ]
  }
}
```

### Redacted fields

Configuration details beyond `functionName`, `region`, `runtime`, and `state`
are not exposed (for example `MemorySize`, `LastModified`, environment variables).

### Error codes

| Condition | Code | Retryable |
|-----------|------|-----------|
| Region not in allowlist | `validation_error` | false |
| `limit` out of range | `validation_error` | false |
| AWS request failure (all regions) | `aws_request_failed` | varies |
| Unknown error | `internal_error` | false |

### Safety boundaries

- No AWS call if region or limit validation fails.
- Partial region failure is tolerated.
- Global result cap applied after multi-region merge.

---

## 8. `list_s3_buckets`

**Purpose:** Lists S3 buckets in the account (global API) with optional result
limiting. Does not return ownership, ACL, policy, or object-level details.

### Input

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `limit` | `number` | no | 100 | Integer 1–100. |

### Region behavior

Global S3 control-plane API signed against `us-east-1`. No region input.
Manifest metadata: `aws.regionMode: global`.

### AWS API

- **Service:** S3
- **Action:** `ListAllMyBuckets`
- **Capability:** `s3:ListAllMyBuckets`

### Cache behavior

| Property | Value |
|----------|-------|
| Cached | Yes |
| Key components | `limit` |
| TTL | 300 seconds (5 minutes) |

### Output

```typescript
{
  content: [{ type: "text", text: string }],
  structuredContent: {
    count: number,
    buckets: [
      {
        name: string,
        createdAt: string  // ISO 8601 from CreationDate
      }
    ]
  }
}
```

### Redacted fields

Owner ID, display name, bucket policies, ACLs, and object listings are not
exposed.

### Error codes

| Condition | Code | Retryable |
|-----------|------|-----------|
| `limit` out of range | `validation_error` | false |
| AWS API failure | `aws_request_failed` | varies |
| Unknown error | `internal_error` | false |

### Safety boundaries

- No AWS call if limit validation fails.
- Bucket names and creation timestamps only.

---

## 9. `list_log_groups`

**Purpose:** Lists CloudWatch log groups in a single region with optional prefix
filtering.

### Input

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `region` | `string` | yes | — | Must be in `AWS_ALLOWED_REGIONS`. |
| `prefix` | `string` | no | — | Max 256 characters. |
| `limit` | `number` | no | 100 | Integer 1–100. |

### Region behavior

Single-region only. `region` is required.

### AWS API

- **Service:** CloudWatch Logs
- **Action:** `DescribeLogGroups`
- **Capability:** `logs:DescribeLogGroups`

### Cache behavior

| Property | Value |
|----------|-------|
| Cached | Yes |
| Key components | `region`, `prefix`, `limit` |
| TTL | 300 seconds (5 minutes) |

### Output

```typescript
{
  content: [{ type: "text", text: string }],
  structuredContent: {
    region: string,
    count: number,
    logGroups: [
      { name: string }
    ]
  }
}
```

### Redacted fields

`creationTime`, `retentionInDays`, `storedBytes`, and other DescribeLogGroups
fields are not exposed.

### Error codes

| Condition | Code | Retryable |
|-----------|------|-----------|
| Region not in allowlist | `validation_error` | false |
| Prefix too long | `validation_error` | false |
| `limit` out of range | `validation_error` | false |
| AWS API failure | `aws_request_failed` | varies |
| Unknown error | `internal_error` | false |

### Safety boundaries

- No AWS call if region, prefix, or limit validation fails.
- Log group names only in the initial version.

---

## 10. `aws_account_overview`

**Purpose:** Returns a bounded account resource overview by composing EC2, Lambda, and S3 inventory capabilities. Disabled by default unless the `aggregates` pack is enabled.

**Pack:** `aggregates` (opt-in)

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `regions` | string[] | no | AWS regions to query (defaults to all allowed regions) |
| `include` | `("ec2" \| "lambda" \| "s3")[]` | no | Sections to include (default: `["ec2"]`) |

### Output (`structuredContent`)

```json
{
  "regions": ["us-east-1"],
  "ec2": {
    "count": 12,
    "countsByState": { "running": 10, "stopped": 2 },
    "countsByRegion": { "us-east-1": 12 },
    "sample": [
      {
        "instanceId": "i-abc123",
        "region": "us-east-1",
        "state": "running",
        "instanceType": "t3.micro",
        "name": "web-1"
      }
    ]
  }
}
```

Only keys present in `include` are returned. Each section includes at most five sample rows (`OVERVIEW_SAMPLE_LIMIT`).

### Redacted fields

No public/private IPs, launch times, availability zones, Lambda environment variables, bucket policies, ACLs, or IAM data.

### Error codes

| Condition | Code | Retryable |
|-----------|------|-----------|
| Region not in allowlist | `validation_error` | false |
| Region fanout exceeds policy | `validation_error` | false |
| Tool or pack disabled | `validation_error` | false |
| AWS API failure | `aws_request_failed` | varies |

### Safety boundaries

- Composes existing AWS clients only — no generic AWS access.
- Invalid input fails before any downstream AWS call.
- Bounded samples only; not a full inventory export.

---

## 11. `aws_cost_overview`

**Purpose:** Returns a bounded cost overview by composing cost summary and cost-by-service capabilities. Disabled by default unless the `aggregates` pack is enabled.

**Pack:** `aggregates` (opt-in)

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | string | yes | Start date (`YYYY-MM-DD`) |
| `endDate` | string | yes | End date (`YYYY-MM-DD`) |
| `granularity` | `"DAILY"` \| `"MONTHLY"` | no | Default `MONTHLY` |
| `serviceLimit` | number | no | Max services to return (1–25, default 10) |

### Output (`structuredContent`)

```json
{
  "period": { "startDate": "2025-01-01", "endDate": "2025-02-01" },
  "granularity": "MONTHLY",
  "total": 123.45,
  "currency": "USD",
  "services": [
    { "service": "Amazon EC2", "amount": 50.0 }
  ]
}
```

### Error codes

| Condition | Code | Retryable |
|-----------|------|-----------|
| Invalid date format or range | `validation_error` | false |
| `serviceLimit` above 25 | `validation_error` | false |
| Tool or pack disabled | `validation_error` | false |
| AWS API failure | `aws_request_failed` | varies |

### Safety boundaries

- Reuses Cost Explorer validation (90-day max range, no future dates).
- Reuses KV cache keys from underlying cost clients.
- Cost-sensitive: marked `paid` in cost-control metadata.

---

## 12. `aws_observability_overview`

**Purpose:** Returns a bounded observability overview by composing CloudWatch alarms and log group inventory. Disabled by default unless the `aggregates` pack is enabled.

**Pack:** `aggregates` (opt-in)

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `regions` | string[] | no | AWS regions to query (defaults to all allowed regions) |
| `include` | `("alarms" \| "logGroups")[]` | no | Sections to include (default: `["alarms"]`) |
| `limit` | number | no | Max sample rows per section (1–100, default 5) |

### Output (`structuredContent`)

```json
{
  "regions": ["us-east-1"],
  "alarms": {
    "count": 5,
    "countsByState": { "OK": 3, "ALARM": 2 },
    "sample": [
      {
        "name": "HighCPU",
        "region": "us-east-1",
        "state": "ALARM",
        "reason": "Threshold Crossed",
        "updatedAt": "2026-06-19T12:00:00.000Z"
      }
    ]
  },
  "logGroups": {
    "count": 20,
    "sample": [
      { "name": "/aws/lambda/example", "region": "us-east-1" }
    ]
  }
}
```

### Redacted fields

No log events, metric namespaces, or stored byte counts in this aggregate.

### Error codes

| Condition | Code | Retryable |
|-----------|------|-----------|
| Region not in allowlist | `validation_error` | false |
| `limit` out of range | `validation_error` | false |
| Tool or pack disabled | `validation_error` | false |
| AWS API failure | `aws_request_failed` | varies |

### Safety boundaries

- Does not fetch log events in this aggregate.
- Invalid input fails before any downstream AWS call.
- Bounded samples only.

---

## Error codes reference

All tool errors use the `GatewayError` class hierarchy and return a consistent
shape.

### Error response shapes

**HTTP-level error (`errorResponse`):**

```typescript
{
  error: {
    code: string,      // GatewayErrorCode
    message: string,   // Human-readable description
    retryable: boolean // Whether the client may retry
  }
}
```

**MCP-level error (`mcpErrorResult`):**

```typescript
{
  content: [{ type: "text", text: string }],
  isError: true,
  structuredContent: {
    error: {
      code: string,
      retryable: boolean
    }
    // message is NOT included in structuredContent — only in text
  }
}
```

### Error codes

| Code | Meaning | When |
|------|---------|------|
| `unauthorized` | Authentication failed | Missing or invalid `MCP_AUTH_TOKEN` (local-bearer) or OAuth access token / `aws:read` scope (oauth) |
| `configuration_error` | Gateway configuration is invalid | Missing or invalid env bindings |
| `validation_error` | Tool input failed validation | Invalid date, region, state, limit, etc. |
| `aws_request_failed` | AWS API call failed | Network error, 5xx, timeout, invalid request |
| `not_found` | Unknown route | HTTP path not matching `/mcp` or `/health` |
| `internal_error` | Unexpected error | Uncaught exception in handler |

### Error hierarchy

```
Error
  └── GatewayError (code, retryable, toJSON())
        ├── ValidationError (retryable always false)
        │     ├── Ec2Error
        │     ├── CloudWatchError
        │     ├── LogsError
        │     └── CostExplorerError
        └── AwsRequestError (statusCode, service, region)
```

### Error handler wrapper

Every tool handler is wrapped in `safeMcpHandler` which:

- Catches `GatewayError` instances and returns `mcpErrorResult(error)`.
- Catches any other error and returns an `internal_error` with a generic
  message `"An unexpected error occurred."`.

---

## Cache behavior summary

| Tool | Cached | Key components | TTL |
|------|--------|----------------|-----|
| `get_gateway_status` | No | N/A | N/A |
| `get_aws_cost_summary` | Yes | startDate, endDate, granularity, metric | 1800s (30 min) |
| `get_aws_cost_by_service` | Yes | startDate, endDate, granularity, metric | 1800s (30 min) |
| `list_ec2_instances` | Yes | regions, stateFilter | 300s (5 min) |
| `get_cloudwatch_alarms` | Yes | regions, stateFilter | 300s (5 min) |
| `get_recent_log_errors` | Yes | logGroupName, region, filterPattern, startTime, endTime, limit | 300s (5 min) |
| `list_lambda_functions` | Yes | regions, limit | 300s (5 min) |
| `list_s3_buckets` | Yes | limit | 300s (5 min) |
| `list_log_groups` | Yes | region, prefix, limit | 300s (5 min) |
| `aws_account_overview` | Yes | per composed client keys | 300s (5 min) |
| `aws_cost_overview` | Yes | startDate, endDate, granularity (×2 CE calls) | 1800s (30 min) |
| `aws_observability_overview` | Yes | per composed client keys | 300s (5 min) |

**Key generation:** `SHA-256(toolName:normalizedParams)` → `ce:{64-hex-chars}`.
Parameters are normalized with sorted keys and type-tagged serialization.

**General rules:**

- AWS is **not** called on cache hit.
- AWS results are **not** cached when the AWS call fails.
- Caching is optional. When `AWS_MCP_CACHE` KV namespace is not configured, all
  tools work without caching.

---

## Security boundaries

1. **Read-only mandate:** All tools are read-only. No write, management, or
   mutation operations are exposed.
2. **No generic AWS access:** There is no `run_aws_cli`, `call_any_aws_api`, or
   arbitrary API proxy tool.
3. **Region allowlist:** Regional tools (`single-region` and `bounded-multi-region`)
   validate regions against the `AWS_ALLOWED_REGIONS` environment variable.
   Account-level tools (`global`, e.g. `list_s3_buckets`) do not accept region
   input and skip request-region allowlist checks.
4. **Input validation before AWS calls:** Zod schemas and security validators
   reject invalid input before any downstream call.
5. **Normalized output:** Raw AWS response fields are never exposed in MCP
   output. Only normalized, documented fields are included.
6. **Credentials never leaked:** AWS access keys, bearer tokens, signed headers,
   and raw stack traces are never exposed in error payloads or MCP content.
7. **Bearer token authentication:** The `/mcp` endpoint requires a valid local bearer token or OAuth access token with `aws:read` scope.
8. **Result size limits:** Cost results are capped at 25 services, log events
   at 50, Lambda functions and S3 buckets and log groups at 100, and date ranges at 90 days.
9. **Log message truncation:** Log event messages are truncated to 1000
   characters.
10. **Cache TTL limits:** Short TTLs (300 seconds for most tools, 1800 seconds
    for cost tools) limit stale data exposure.

---

## Environment configuration

The following environment bindings are required to use the AWS-backed MCP tools:

| Binding | Description |
|---------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_REGION` | Default signing region (must be in `AWS_ALLOWED_REGIONS`) |
| `AWS_ALLOWED_REGIONS` | Comma-separated list of allowed regions |

Authentication bindings depend on `AUTH_MODE`:

| Binding | Mode | Description |
|---------|------|-------------|
| `MCP_AUTH_TOKEN` | `local-bearer` only | Bearer token for local MCP authentication |
| OAuth vars (`MCP_RESOURCE_URL`, `OAUTH_ISSUER`, `OAUTH_AUDIENCE`, `OAUTH_JWKS_URI`, `OAUTH_REQUIRED_SCOPES`, …) | `oauth` only | Production ChatGPT connector auth — see [deployment.md](deployment.md) and [specs/oauth-chatgpt-connector.md](specs/oauth-chatgpt-connector.md) |

Optional binding:

| Binding | Description |
|---------|-------------|
| `AWS_MCP_CACHE` | Cloudflare KV namespace for caching |

If configuration is missing, unauthenticated callers receive a generic
`configuration_error`. Authenticated callers receive a specific list of missing
bindings.
