# AWS capability matrix

This document maps each AWS-backed MCP tool to declared capability IDs, IAM actions,
region mode, risk level, and cost metadata. It is generated deterministically from
tool manifests and the capability registry in `src/aws/capabilities.ts`.

New AWS-backed tools must update capability metadata and regenerate this document
before merge.

The checked-in IAM policy at `infra/aws/iam-readonly-policy.json` must contain exactly
the unique IAM actions listed in this matrix. Drift is enforced by
`src/aws/iam-readonly-policy.test.ts`.

| Tool | Pack | AWS service | AWS action | Region mode | Risk level | Cache TTL (s) | Cost class | Cost control | Cost sensitivity |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| aws_account_overview | aggregates | ec2 | ec2:DescribeInstances | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |
| aws_account_overview | aggregates | lambda | lambda:ListFunctions | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |
| aws_account_overview | aggregates | s3 | s3:ListAllMyBuckets | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | low |
| aws_cost_overview | aggregates | ce | ce:GetCostAndUsage | single-region | read-only | 1800 | cached-read | paid | paid |
| aws_observability_overview | aggregates | cloudwatch | cloudwatch:DescribeAlarms | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |
| aws_observability_overview | aggregates | logs | logs:DescribeLogGroups | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | volume-sensitive |
| get_aws_cost_by_service | cost | ce | ce:GetCostAndUsage | single-region | read-only | 1800 | cached-read | paid | paid |
| get_aws_cost_summary | cost | ce | ce:GetCostAndUsage | single-region | read-only | 1800 | cached-read | paid | paid |
| get_cloudwatch_alarms | observability | cloudwatch | cloudwatch:DescribeAlarms | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |
| get_recent_log_errors | observability | logs | logs:FilterLogEvents | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |
| list_ec2_instances | inventory | ec2 | ec2:DescribeInstances | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |
| list_lambda_functions | inventory | lambda | lambda:ListFunctions | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |
| list_log_groups | observability | logs | logs:DescribeLogGroups | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |
| list_s3_buckets | inventory | s3 | s3:ListAllMyBuckets | single-region | read-only | 300 | cached-read | low | low |
