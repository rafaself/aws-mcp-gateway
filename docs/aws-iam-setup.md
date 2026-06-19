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
> Never commit access keys to Git. The `.env.example` file documents which variables are required, but real secrets must only be stored in Cloudflare Secrets or your secrets manager.

## Step 4: Store credentials in Cloudflare

Configure the gateway Worker with the credentials using Wrangler:

```bash
wrangler secret put AWS_ACCESS_KEY_ID
# Paste the access key ID when prompted.

wrangler secret put AWS_SECRET_ACCESS_KEY
# Paste the secret access key when prompted.

wrangler secret put MCP_AUTH_TOKEN
# Set a strong random bearer token that ChatGPT will use to authenticate.
```

These commands upload the values to Cloudflare's secure secrets store. The values are encrypted at rest and injected as environment variables at runtime. They never appear in your source code, Wrangler configuration, or Git history.

## Verification

Deploy or run the Worker locally with these secrets configured:

```bash
wrangler dev
```

Then verify the MCP endpoint responds with a valid tool list:

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer <your-mcp-auth-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A successful response returns the list of available MCP tools. An authentication error indicates the `MCP_AUTH_TOKEN` is mismatched. An access-denied error from AWS indicates the IAM credentials or policy need review.

## Security rationale

### Why least-privilege is required

The gateway is designed to be a narrow policy enforcement layer. AWS-managed policies such as `ReadOnlyAccess`, `ViewOnlyAccess`, or `AdministratorAccess` grant far more permissions than the MVP needs:

- `ReadOnlyAccess` includes thousands of read actions across every AWS service, many of which expose sensitive data (IAM users, KMS keys, Secrets Manager secrets, S3 bucket objects).
- `AdministratorAccess` grants full write access to every AWS resource — a single misconfiguration or compromised credential could be catastrophic.

The custom policy in this repository is intentionally narrow:

- It lists exactly the AWS actions the MVP tools call.
- Blocking all mutation actions by default prevents accidental or malicious resource changes even if the MCP endpoint authentication were bypassed.
- Every new tool requires an explicit policy expansion, creating a natural review point.

### Why the MVP remains read-only

The MVP explicitly avoids write-capable tools for three reasons:

1. **IAM boundary** — The custom policy has zero `Create`, `Update`, `Delete`, `Put`, `Terminate`, `Start`, `Stop` or similar write actions. Even if a future tool attempted a mutation, the IAM policy would reject it.
2. **Worker enforcement** — The gateway only exposes explicit, allowlisted read tools. There is no generic `run_aws_cli` or `call_any_aws_api` escape hatch.
3. **Security model separation** — Write-capable management tools will use a separate IAM policy, separate authentication, and explicit confirmation requirements when they are added in a future phase.

Until then, the entire system is constrained to read-only access at both the IAM layer and the application layer.
