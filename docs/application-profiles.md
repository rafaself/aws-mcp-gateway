# Application profiles

Application profiles are **optional** saved operational context for the AWS MCP Gateway. They store resource names, regions, and optional credential strategies — not secrets and not authorization.

The gateway works fully without profiles. Generic AWS tools accept resource names directly and do not require a profile. Missing or misconfigured profile storage does not break `/mcp`.

## What profiles are

Profiles answer: “which named environment should higher-level tools use?” without hardcoding resource identifiers in every request.

```text
profileId -> KV profile document -> resource names -> optional auth strategy -> AWS read-only calls
```

Profiles are:

- **Operational context** — cluster names, bucket names, log group names, role ARNs, display names, aliases
- **Optional** — the gateway and all generic tools work when `AWS_MCP_APP_CONFIG` is absent
- **Not authorization** — OAuth scopes, tool manifest policy, allowed regions, and IAM remain the security boundary
- **Not secret storage** — never put credentials, tokens, passwords, or connection strings in profile JSON

The optional `application-ops` tool pack consumes profiles through `list_application_profiles` and profile-driven aggregate tools. Generic tools remain independent and do not require profiles.

## Application-ops pack

Enable the pack when KV profiles are configured:

```text
AWS_MCP_ENABLED_TOOL_PACKS=core,cost,inventory,observability,database,application-ops
```

Workflow:

1. Call `list_application_profiles` to discover safe profile metadata (`id`, `displayName`, `environment`, `region`, `enabled`, `capabilities`, `profileConfigAvailable`).
2. Pass `profileId` explicitly to aggregate tools such as `get_application_environment_overview`.
3. Profiles are operational context only — not authorization. OAuth scopes, tool packs, allowed regions, and IAM remain the security boundary.

## KV binding

Application profiles are optional. Do not configure `AWS_MCP_APP_CONFIG` unless you use the application-ops profile workflow.

When you need profiles, add a **separate** KV namespace from `AWS_MCP_CACHE`:

```jsonc
{
  "binding": "AWS_MCP_APP_CONFIG",
  "id": "<your-app-config-kv-namespace-id>",
  "remote": true
}
```

Optional index key var (defaults to `app-profiles/index.json`):

```jsonc
"AWS_MCP_APP_PROFILE_INDEX_KEY": "app-profiles/index.json"
```

Create the namespace:

```bash
wrangler kv:namespace create "AWS_MCP_APP_CONFIG"
```

## Key layout

```text
app-profiles/index.json
app-profiles/profiles/<profileId>.json
```

`<profileId>` must match `/^[a-z0-9][a-z0-9-_]{1,62}$/`.

## Index schema (version 1)

```json
{
  "version": 1,
  "profiles": [
    {
      "id": "example-prod",
      "displayName": "Example Production",
      "environment": "production",
      "region": "us-east-1",
      "enabled": true,
      "aliases": ["example", "prod"],
      "capabilities": ["ecs", "rds", "logs"]
    }
  ]
}
```

## Profile schema (version 1)

A profile contains metadata and resource names only:

```json
{
  "version": 1,
  "id": "example-prod",
  "displayName": "Example Production",
  "environment": "production",
  "region": "us-east-1",
  "auth": { "strategy": "default" },
  "resources": {
    "ecs": {
      "clusterName": "example-production",
      "serviceName": "example-production-api",
      "logGroupName": "/ecs/example-production",
      "containers": ["api"]
    },
    "rds": {
      "dbInstanceIdentifier": "example-production"
    },
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

Supported resource blocks: `ecs`, `rds`, `ses`, `s3`, `ssm`, `ecr`, `sns`, `eventbridge`, `budget`. A profile must include at least one known block.

Profile `region` must be within `AWS_ALLOWED_REGIONS`. Per-resource `auth` overrides use the same shape as [`CredentialRequest`](aws-credentials.md#assume-role-resolver) (`default` or `assume-role` with IAM **role** ARN only).

## Empty-state behavior

| Condition | Profile list | Profile load |
| --- | --- | --- |
| `AWS_MCP_APP_CONFIG` missing | `disabled`, empty list | Validation error: not configured |
| KV read failure | `unavailable`, empty list | Validation error: unavailable |
| Index missing | `available`, empty list | Validation error if profile requested |
| Index valid and empty | `available`, empty list | Validation error if profile requested |
| Index invalid (malformed JSON or schema) | `invalid`, empty list, safe `error` message | Validation error: index invalid |
| Profile missing | — | Validation error: not found |
| Profile invalid | — | Validation error (fail closed) |

Invalid profiles do not break generic MCP tools.

## Diagnosing an invalid profile index

When `list_application_profiles` returns `storeStatus: "invalid"`:

1. The KV binding exists but `app-profiles/index.json` (or your custom `AWS_MCP_APP_PROFILE_INDEX_KEY`) contains malformed JSON or fails schema validation.
2. Re-validate and republish the index using the profile CLI:

```bash
pnpm run app-profile:validate -- --file examples/app-profiles/example-prod.profile.json
pnpm run app-profile:put -- --file examples/app-profiles/example-prod.profile.json --remote
```

3. Confirm `list_application_profiles` returns `storeStatus: "available"` with the expected profile entries.
4. Never store secrets in profile KV — only resource names, prefixes, and role ARNs.

## Secret boundaries

Profiles **may** contain:

```text
resource names, prefixes, bucket names, log group names, role ARNs, display names, aliases
```

Profiles **must never** contain:

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

Never store profiles in `AWS_MCP_CACHE`. That namespace is for normalized tool response caching only.

## CLI workflow

Use the repo-managed scripts to validate and publish profiles without editing KV manually. Scripts reuse the same Worker validation rules and accept profile JSON from files only (no inline JSON arguments).

Prerequisites:

- `pnpm install`
- `AWS_MCP_APP_CONFIG` binding in your Wrangler config (required for profile CLI only — not for gateway deploy)
- `AWS_ALLOWED_REGIONS` in Wrangler `vars` (used for region validation)

Validate a local profile file (metadata-only output):

```bash
pnpm run app-profile:validate -- --file examples/app-profiles/example-prod.profile.json
```

Upload to local KV (default) after validation:

```bash
pnpm run app-profile:put -- --file examples/app-profiles/example-prod.profile.json
```

Upload to remote KV:

```bash
pnpm run app-profile:put -- --file examples/app-profiles/example-prod.profile.json --remote
```

List index metadata (no full profile bodies):

```bash
pnpm run app-profile:list
pnpm run app-profile:list -- --remote
```

Delete a profile (requires explicit confirmation):

```bash
pnpm run app-profile:delete -- --profile-id example-prod --yes --remote
```

Common flags:

- `-c, --config <path>` — Wrangler config (default: `wrangler.jsonc`)
- `-e, --env <name>` — Wrangler environment
- `--remote` — target remote KV instead of local storage

Safety notes:

- Invalid JSON or schema failures exit non-zero.
- Corrupt existing index data is not silently overwritten.
- Script output stays metadata-only and never prints secret-looking values.

## Related documentation

- [`aws-tools.md`](aws-tools.md) — generic direct-input tools (no profiles required)
- [`iam-cross-account.md`](iam-cross-account.md) — multi-account AssumeRole IAM setup
- [`aws-credentials.md`](aws-credentials.md) — default credentials and AssumeRole resolver
- [`deployment.md`](deployment.md) — Worker bindings and deployment setup
