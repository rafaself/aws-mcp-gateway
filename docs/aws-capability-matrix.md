# AWS capability matrix

This document maps each AWS-backed MCP tool to declared capability IDs, IAM actions,
region mode, risk level, and cost metadata. It is generated deterministically from
tool manifests and the capability registry in `src/aws/capabilities.ts`.

New AWS-backed tools must update capability metadata and regenerate this document
before merge.

| Tool | Pack | AWS service | AWS action | Region mode | Risk level | Cache TTL (s) | Cost class | Cost control | Cost sensitivity |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| get_aws_cost_by_service | cost | ce | ce:GetCostAndUsage | single-region | read-only | 1800 | cached-read | paid | paid |
| get_aws_cost_summary | cost | ce | ce:GetCostAndUsage | single-region | read-only | 1800 | cached-read | paid | paid |
| get_cloudwatch_alarms | observability | cloudwatch | cloudwatch:DescribeAlarms | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |
| get_recent_log_errors | observability | logs | logs:FilterLogEvents | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |
| list_ec2_instances | inventory | ec2 | ec2:DescribeInstances | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |
