# AWS credentials and AssumeRole

This document explains how the gateway manages AWS credentials, including temporary credentials obtained through STS `AssumeRole`.

## Recommended model

Use one default gateway IAM user in the runtime account, then assume read-only roles in other accounts or for resource-specific access:

```text
default gateway credential
  -> optional sts:AssumeRole
    -> temporary credentials for the target account/resource
```

This keeps a single long-lived access key in Cloudflare secrets while enabling multi-account read access without storing multiple IAM users in the Worker.

## Default credentials

Every deployment requires:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

These are loaded at startup into `GatewayContext.credentials`. Existing MCP tools continue to use these default credentials directly.

The default IAM user needs:

1. Permissions for the read-only MCP tool actions (see [`infra/aws/iam-readonly-policy.json`](../infra/aws/iam-readonly-policy.json)).
2. `sts:AssumeRole` on the target roles you intend to use.

Restrict `sts:AssumeRole` `Resource` values in production to trusted role ARNs instead of `*`.

## AssumeRole resolver

`GatewayContext.credentialResolver` resolves credentials for infrastructure use and future profile/resource configuration.

### Strategies

**Default** — returns the gateway's static credentials:

```typescript
await ctx.credentialResolver.resolve({ strategy: "default" });
```

**Assume role** — exchanges default credentials for temporary credentials:

```typescript
await ctx.credentialResolver.resolve({
  strategy: "assume-role",
  roleArn: "arn:aws:iam::123456789012:role/AwsMcpGatewayReadOnly",
  externalId: "optional-trusted-external-id",
  sessionName: "optional-custom-session-name",
});
```

Future resource profiles can declare the same shape:

```json
{
  "auth": {
    "strategy": "assume-role",
    "roleArn": "arn:aws:iam::123456789012:role/AwsMcpGatewayReadOnly"
  }
}
```

### Returned credential shape

Resolved credentials include:

| Field | Description |
| --- | --- |
| `accessKeyId` | Temporary or default access key ID |
| `secretAccessKey` | Matching secret access key |
| `sessionToken` | Present for assumed-role credentials; required for SigV4 |
| `expiresAt` | Epoch milliseconds for assumed-role credentials |
| `source` | `"default"` or `"assume-role"` |

Pass resolved credentials to existing AWS client helpers (`awsRequest`, service clients). The shared `createAwsClient` helper includes `X-Amz-Security-Token` when `sessionToken` is set.

## In-memory credential cache

Assumed-role credentials are cached only in Worker memory:

- Cache is per resolver instance (per isolate).
- Cold starts call STS again when no valid cache entry exists.
- Entries refresh automatically when within five minutes of expiration.
- Cache keys are SHA-256 hashes of `roleArn` and optional `externalId` — raw secrets are never used as cache keys.

**Never store AWS credentials, session tokens, or assumed-role results in KV.** KV is reserved for normalized tool response caching only.

## Target role trust policy

Each target role must trust the gateway IAM principal. Example trust policy:

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

Attach a read-only policy on the target role with only the actions required for the resources being accessed.

## Security boundaries

- `roleArn` is configuration metadata and may appear in operational context when needed.
- `externalId` must never be logged, returned in tool output, or included in error payloads.
- Temporary credentials must never appear in tool output, structured content, logs, or errors.
- STS failures are normalized through `AwsRequestError` without leaking signed request details or raw AWS responses.
- Assumed-role credentials are infrastructure-only; MCP tools do not expose credential resolution as a public tool.

## Related documentation

- [`docs/aws-iam-setup.md`](aws-iam-setup.md) — IAM user and policy setup
- [`docs/aws-capability-matrix.md`](aws-capability-matrix.md) — tool-to-IAM action mapping
- [`SECURITY.md`](../SECURITY.md) — operational security checklist
