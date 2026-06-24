# Generic AWS tools

This guide explains how the gateway exposes **direct, generic AWS read tools** that work without application profiles. Profiles are optional personalization — not a required runtime dependency.

For per-tool input/output contracts, see [`mcp-tools.md`](mcp-tools.md). For IAM action mapping, see [`aws-capability-matrix.md`](aws-capability-matrix.md).

## Operational model

```text
Authenticated /mcp request
  -> tool name + resource identifiers in input
  -> policy gate (packs, scopes, limits)
  -> default gateway credentials
  -> signed read-only AWS API call
  -> normalized structuredContent
```

Generic tools accept resource names directly. They do **not** read `AWS_MCP_APP_CONFIG` and do **not** require a `profileId`.

| Input | Used by |
| --- | --- |
| `clusterName` | ECS health, task list, stopped tasks, ECR compare |
| `serviceName` | ECS health, task list, stopped tasks, ECR compare |
| `logGroupName` | `get_recent_log_errors`, `get_cloudwatch_logs` |
| `dbInstanceIdentifier` | RDS health, RDS metrics |
| `repositoryName` | ECR image status, ECS/ECR compare |
| `bucketName` | S3 bucket posture |
| `configurationSetName` | SES configuration status |
| `topicName` / `topicArn` | SNS topic status |
| `budgetName` | Budget status (with `accountId`) |
| `region` | All regional tools; must be in `AWS_ALLOWED_REGIONS` |

Missing or misconfigured profile KV does **not** break generic tools or `/mcp`.

Direct generic tools use **default gateway credentials only**. They do not accept `roleArn` or `externalId` as public inputs. Cross-account access is configured through KV-backed application profiles — see [Cross-account reads](#cross-account-reads).

## Recommended setup order

1. **Deploy the gateway** with AWS credentials, OAuth or local bearer auth, and `AWS_ALLOWED_REGIONS`. See [`deployment.md`](deployment.md).
2. **Attach the read-only IAM policy** to a dedicated gateway user. See [`aws-iam-setup.md`](aws-iam-setup.md).
3. **Enable tool packs** you need via `AWS_MCP_ENABLED_TOOL_PACKS` (default exposes 21 tools). See [tool exposure](../README.md#tool-exposure-optional).
4. **Optionally configure KV cache** (`AWS_MCP_CACHE`) for repeated reads. See [`deployment.md`](deployment.md#optional-kv-cache).
5. **Optionally add cross-account roles** when resources live in other accounts. See [`iam-cross-account.md`](iam-cross-account.md).
6. **Optionally add application profiles** when you want saved operational context for the `application-ops` pack. See [`application-profiles.md`](application-profiles.md).

Steps 5 and 6 are independent. Generic tools work at step 3 without profiles or cross-account setup.

## Tool packs

Generic AWS tools are grouped into packs. Enable packs in `AWS_MCP_ENABLED_TOOL_PACKS`.

| Pack | Generic tools (direct input) | Default |
| --- | --- | --- |
| `inventory` | `list_ec2_instances`, `list_lambda_functions`, `list_s3_buckets`, `get_ecr_image_status`, `compare_ecs_task_image_with_ecr` | enabled |
| `observability` | `get_cloudwatch_alarms`, `get_cloudwatch_logs`, `get_cloudwatch_alarm_summary`, `get_recent_log_errors`, `list_log_groups`, `get_ecs_service_health`, `list_ecs_tasks`, `get_recent_stopped_ecs_tasks`, `get_sns_topic_status`, `get_eventbridge_rules_status` | enabled |
| `database` | `get_rds_instance_health`, `get_rds_metrics` | enabled |
| `cost` | `get_aws_cost_summary`, `get_aws_cost_by_service`, `get_budget_status` | enabled |
| `security` | `check_ssm_parameter_inventory`, `get_s3_bucket_posture`, `get_ses_configuration_status` | **disabled** |
| `aggregates` | `aws_account_overview`, `aws_cost_overview`, `aws_observability_overview` (compose other tools) | **disabled** |

The `application-ops` pack is profile-driven and documented separately in [`application-profiles.md`](application-profiles.md).

Example — enable security tools for SSM inventory and S3/SES checks:

```text
AWS_MCP_ENABLED_TOOL_PACKS=core,cost,inventory,observability,database,security
```

## Cross-account reads

Direct generic tools do **not** accept `roleArn` or `externalId` as public inputs. Role selection is infrastructure configuration, not runtime tool input.

For resources in other AWS accounts, configure cross-account access through **KV-backed application profiles** with `auth.strategy: "assume-role"` and a validated IAM role ARN. The gateway user must have `sts:AssumeRole` on the target role via the optional add-on policy at [`infra/aws/iam-assume-role-policy.example.json`](../infra/aws/iam-assume-role-policy.example.json).

Common cases:

- **SES** in a separate account — `resources.ses.auth` with `assume-role`, then use `application-ops` tools (for example `get_application_environment_overview`)
- **SNS / budgets / EventBridge** in another account — per-resource `auth.strategy: "assume-role"` on the relevant block, or profile-level `auth` when the whole environment shares one cross-account role

See [`iam-cross-account.md`](iam-cross-account.md) for trust policies, base-user `sts:AssumeRole` permissions, and examples.

## Read-only guarantee

All generic tools in the current scope are **read-only**. There is no generic AWS CLI tool, no arbitrary API proxy, and no write or management operations.

- IAM policy template: [`infra/aws/iam-readonly-policy.json`](../infra/aws/iam-readonly-policy.json)
- Future write tools: [`post-mvp-boundaries.md`](post-mvp-boundaries.md)

## Security warnings

### CloudWatch Logs

Log tools (`get_cloudwatch_logs`, `get_recent_log_errors`) return bounded, truncated log event messages. Messages may still contain application secrets, tokens, or PII even after truncation (`LOGS_MAX_MESSAGE_LENGTH` in `src/security/limits.ts`).

- Treat log tool output as potentially sensitive in ChatGPT sessions and audit logs.
- Prefer narrow `logGroupName`, `streamPrefix`, and `filterPattern` inputs.
- Do not rely on the gateway to redact arbitrary secret patterns inside log bodies.

### SSM parameter inventory

`check_ssm_parameter_inventory` is **metadata-only**. It calls `ssm:DescribeParameters` to verify that expected parameter **names** exist under a prefix. It does **not** call `GetParameter` or `GetParameters` and never returns parameter values.

Profile-driven `get_application_secret_inventory` follows the same metadata-only model for configured parameter names.

### Normalized output

Generic tools return normalized `structuredContent` — not raw AWS JSON. Sensitive endpoints (for example SNS subscription emails) are masked in tool output. See per-tool contracts in [`mcp-tools.md`](mcp-tools.md).

## OAuth scopes

Production deployments should use:

```text
OAUTH_REQUIRED_SCOPES=aws:read
```

The gateway validates OAuth tokens against `OAUTH_REQUIRED_SCOPES` at the `/mcp` boundary. Individual tools may declare additional `auth.requiredScopes` in their manifest; the policy gate enforces those per tool without requiring every domain scope globally at the OAuth layer.

See [`SECURITY.md`](../SECURITY.md#oauth-scope-checklist) and [`specs/secure-tool-platform.md`](specs/secure-tool-platform.md).

## When to use application profiles

Use generic tools when you know the resource identifiers for each call.

Use [application profiles](application-profiles.md) when you want:

- saved environment context (`profileId` → cluster, service, log group, RDS id, …);
- the `application-ops` pack (`list_application_profiles`, `get_application_environment_overview`, …);
- per-resource `auth.strategy` (for example `assume-role` for SES in another account) stored in KV.

Profiles are operational context only — not secrets, not authorization, and not required for generic tools.

## Related documentation

- [`mcp-tools.md`](mcp-tools.md) — authoritative per-tool contracts
- [`aws-capability-matrix.md`](aws-capability-matrix.md) — tool-to-IAM mapping
- [`application-profiles.md`](application-profiles.md) — optional KV-backed profiles
- [`iam-cross-account.md`](iam-cross-account.md) — multi-account IAM setup
- [`aws-credentials.md`](aws-credentials.md) — credential resolver and AssumeRole runtime behavior
