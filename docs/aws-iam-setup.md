# AWS IAM setup

This guide walks through creating a least-privilege IAM user and configuring its credentials in Cloudflare so the MCP gateway can make signed AWS API requests.

## Prerequisites

- An AWS account with administrative access (or one where you can create IAM users and policies).
- The [custom IAM policy](../infra/aws/iam-readonly-policy.json) from this repository.
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated against your Cloudflare account.

## Step 1: Create an IAM user

1. Open the [IAM console](https://console.aws.amazon.com/iam/home) and select **Users** → **Create user**.
2. Set the user name (e.g. `aws-mcp-gateway`).
3. Select **Provide user access to the AWS Management Console** — **uncheck** this. The gateway needs only programmatic access.
4. Click **Next**.
5. Select **Attach policies directly**. You will attach the custom policy in the next step, not a built-in AWS policy.
6. Click **Next** and then **Create user**.

## Step 2: Attach the custom IAM policy

1. Open the newly created user and go to the **Permissions** tab.
2. Click **Add permissions** → **Create inline policy**.
3. Switch to the **JSON** tab.
4. Paste the contents of [`infra/aws/iam-readonly-policy.json`](../infra/aws/iam-readonly-policy.json).
5. Click **Review policy**.
6. Set the policy name to `AwsMcpGatewayReadOnly`.
7. Click **Create policy**.

The policy grants only the read/list/describe/get actions required by the gateway's MCP tools. It does not include any mutation actions such as `StartInstances`, `PutMetricAlarm`, `DeleteLogGroup` or similar.

## Step 3: Create an access key

1. In the IAM user detail page, open the **Security credentials** tab.
2. Under **Access keys**, click **Create access key**.
3. Select **Application running outside AWS** (or **Command line interface (CLI)** — both work for this use case).
4. Click **Next**, optionally add a description tag, then click **Create access key**.
5. Copy the **Access key ID** and **Secret access key** to a temporary secure location. You will not be able to retrieve the secret key again.

> **⚠️ Security warning**
>
> Never commit access keys to Git. See [`.dev.vars.example`](../.dev.vars.example) for local variable names; real secrets must only be stored in Cloudflare Secrets (deployed) or `.dev.vars` (local development).

## Step 4: Store credentials

AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) are required in every deployment. MCP authentication differs by `AUTH_MODE`.

### Local development (`AUTH_MODE=local-bearer`)

Create a non-committed `.dev.vars` file in the project root (see [`.dev.vars.example`](../.dev.vars.example)):

```text
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AUTH_MODE=local-bearer
MCP_AUTH_TOKEN="..."
```

Wrangler automatically reads `.dev.vars` when running `pnpm dev` or `wrangler dev`.

### Deployed Workers — OAuth production (`AUTH_MODE=oauth`)

Production ChatGPT connectors use OAuth. Store only AWS credentials as Cloudflare secrets:

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
```

Configure OAuth values in `wrangler.jsonc` `[vars]` and deploy. Do **not** set `MCP_AUTH_TOKEN` in OAuth mode. See [deployment.md](deployment.md) and [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md).

Alternatively, use `pnpm run sync-secrets` with `.env.deploy.local` as described in [deployment.md](deployment.md).

### Deployed Workers — local bearer (`AUTH_MODE=local-bearer`)

For non-ChatGPT deployments or testing only:

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
wrangler secret put MCP_AUTH_TOKEN
```

These values are encrypted at rest and injected as environment variables at runtime. They never appear in source code, Wrangler configuration, or Git history.

## Verification

### Local (`AUTH_MODE=local-bearer`)

Ensure `.dev.vars` includes AWS credentials and `MCP_AUTH_TOKEN`, then start the dev server:

```bash
pnpm dev
```

Verify `tools/list` with curl — see [mcp-testing.md](mcp-testing.md).

### Deployed — OAuth production

After deploying with `AUTH_MODE=oauth`:

```bash
pnpm run verify:oauth
pnpm run verify:oauth:authenticated
```

See [chatgpt-connector-production-acceptance.md](chatgpt-connector-production-acceptance.md) for the full production gate.

### Deployed — local bearer

After configuring secrets and deploying with `AUTH_MODE=local-bearer`:

```bash
curl -sS -X POST "https://<worker-host>/mcp" \
  -H "Authorization: Bearer <your-mcp-auth-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A successful response returns the list of available MCP tools. An authentication error indicates `MCP_AUTH_TOKEN` is mismatched. An access-denied error from AWS indicates the IAM credentials or policy need review.

## Security rationale

### Why least-privilege is required

The gateway is designed to be a narrow policy enforcement layer. AWS-managed policies such as `ReadOnlyAccess`, `ViewOnlyAccess`, or `AdministratorAccess` grant far more permissions than the current read-only scope needs:

- `ReadOnlyAccess` includes thousands of read actions across every AWS service, many of which expose sensitive data (IAM users, KMS keys, Secrets Manager secrets, S3 bucket objects).
- `AdministratorAccess` grants full write access to every AWS resource — a single misconfiguration or compromised credential could be catastrophic.

The custom policy in this repository is intentionally narrow:

- It lists exactly the AWS actions the supported MCP tools call.
- Blocking all mutation actions by default prevents accidental or malicious resource changes even if the MCP endpoint authentication were bypassed.
- Every new tool requires an explicit policy expansion, creating a natural review point.

### Why the gateway remains read-only

The current read-only scope explicitly avoids write-capable tools for three reasons:

1. **IAM boundary** — The custom policy has zero `Create`, `Update`, `Delete`, `Put`, `Terminate`, `Start`, `Stop` or similar write actions. Even if a future tool attempted a mutation, the IAM policy would reject it.
2. **Worker enforcement** — The gateway only exposes explicit, allowlisted read tools. There is no generic `run_aws_cli` or `call_any_aws_api` escape hatch.
3. **Security model separation** — Write-capable management tools will use a separate IAM policy, separate authentication, and explicit confirmation requirements when they are added in a future phase.

Until then, the entire system is constrained to read-only access at both the IAM layer and the application layer.
