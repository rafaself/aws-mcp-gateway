# Cross-account IAM model

This guide documents the recommended IAM pattern for multi-account read access through the AWS MCP Gateway.

Runtime credential resolution is described in [`aws-credentials.md`](aws-credentials.md). Generic tool usage is in [`aws-tools.md`](aws-tools.md). Base IAM user setup is in [`aws-iam-setup.md`](aws-iam-setup.md).

## Preferred model

Use **one default gateway IAM user** (stored as Cloudflare secrets) plus **STS `AssumeRole`** into target read-only roles when resources live in other accounts or need scoped credentials:

```text
default gateway credential (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
  -> optional sts:AssumeRole
    -> temporary credentials for target account
      -> read-only AWS API calls
```

Benefits:

- A single long-lived access key in the Worker runtime
- No multiple IAM users or keys stored in Cloudflare
- Per-resource or per-account roles with least-privilege policies
- Assumed-role sessions are cached in Worker memory only — never in KV

## Same-account default reads

For resources in the gateway's home account, tools use default credentials directly. No `roleArn` is required.

1. Create a dedicated IAM user (for example `aws-mcp-gateway`).
2. Attach the project read-only policy: [`infra/aws/iam-readonly-policy.json`](../infra/aws/iam-readonly-policy.json).
3. Store `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as Cloudflare secrets.

The template policy includes `sts:AssumeRole` so the same user can assume trusted roles when needed. Restrict `Resource` in production — see below.

## Cross-account SES example

SES configuration sets often live in a dedicated mail-sending account. Two supported patterns:

### Tool-level `roleArn`

Call `get_ses_configuration_status` with explicit resource and role inputs:

```json
{
  "configurationSetName": "example-production",
  "region": "us-east-1",
  "roleArn": "arn:aws:iam::123456789012:role/AwsMcpGatewaySesReadOnly"
}
```

### Profile-level `auth.strategy`

Store the role in an application profile (operational context only — not a secret):

```json
{
  "resources": {
    "ses": {
      "auth": {
        "strategy": "assume-role",
        "roleArn": "arn:aws:iam::123456789012:role/AwsMcpGatewaySesReadOnly"
      },
      "configurationSetName": "example-production"
    }
  }
}
```

See [`examples/app-profiles/example-prod.profile.json`](../examples/app-profiles/example-prod.profile.json) and [`application-profiles.md`](application-profiles.md).

## Target role trust policy

Each target role must trust the gateway IAM principal. Example trust policy on the **target account** role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::RUNTIME_ACCOUNT_ID:user/aws-mcp-gateway"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "your-external-id"
        }
      }
    }
  ]
}
```

- Replace `RUNTIME_ACCOUNT_ID` with the account that owns the gateway IAM user.
- `sts:ExternalId` is optional but recommended for third-party access patterns.
- `externalId` is never logged or returned in tool output.

Attach a **read-only policy on the target role** with only the actions required for the resources being accessed. Use [`aws-capability-matrix.md`](aws-capability-matrix.md) to pick actions — for SES, typically `ses:GetConfigurationSet`, `ses:GetConfigurationSetEventDestinations`, and related read actions declared by the tool manifest.

## Base user `sts:AssumeRole` policy

The gateway user's inline or managed policy must allow assuming only trusted roles. **Do not use `"Resource": "*"` in production.**

Example statement to add alongside the read-only tool policy (or as a separate inline policy):

```json
{
  "Sid": "AssumeTrustedReadOnlyRoles",
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": [
    "arn:aws:iam::123456789012:role/AwsMcpGatewaySesReadOnly",
    "arn:aws:iam::987654321098:role/AwsMcpGatewaySharedReadOnly"
  ]
}
```

The checked-in template at [`infra/aws/iam-readonly-policy.json`](../infra/aws/iam-readonly-policy.json) includes a broad `sts:AssumeRole` entry for development convenience. Tighten `Resource` to explicit role ARNs before production deployment.

## Target role permissions

Target roles should be **narrower** than the gateway home-account policy when possible:

| Access need | Example actions | Notes |
| --- | --- | --- |
| SES configuration read | `ses:GetConfigurationSet`, `ses:GetConfigurationSetEventDestinations` | Match `get_ses_configuration_status` manifest |
| SNS topic read | `sns:GetTopicAttributes`, `sns:ListSubscriptionsByTopic` | Subscription endpoints are masked in output |
| Budget read | `budgets:DescribeBudgets`, `budgets:DescribeNotificationsForBudget` | Requires correct `accountId` in tool input |

Do not attach `AdministratorAccess` or broad `ReadOnlyAccess` to cross-account roles unless you have explicitly reviewed the blast radius.

## What never goes in profiles or KV

Application profiles and KV store **resource names and role ARNs** — never credentials or secret values.

Profiles and KV **must never** contain:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
DATABASE_URL
JWT_SECRET
passwords
bearer tokens
connection strings
SSM parameter values
```

Assumed-role temporary credentials are held in Worker memory only. Never store them in `AWS_MCP_CACHE` or `AWS_MCP_APP_CONFIG`.

See [`application-profiles.md#secret-boundaries`](application-profiles.md#secret-boundaries).

## Verification

After configuring trust and policies:

1. Deploy with default credentials and `AWS_ALLOWED_REGIONS` including the target region.
2. Enable the relevant tool pack (`security` for SES/SSM/S3 posture tools).
3. Call a tool with `roleArn` (or use a profile with `assume-role` auth).
4. Confirm normalized output — no credentials, session tokens, or raw AWS bodies in the response.

For local bearer testing, see [`mcp-testing.md`](mcp-testing.md).

## Related documentation

- [`aws-credentials.md`](aws-credentials.md) — resolver API, in-memory cache, security boundaries
- [`aws-iam-setup.md`](aws-iam-setup.md) — gateway IAM user creation
- [`aws-tools.md`](aws-tools.md) — generic tools and optional `roleArn` inputs
- [`application-profiles.md`](application-profiles.md) — per-resource `auth.strategy` in profiles
