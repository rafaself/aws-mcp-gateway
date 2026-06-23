# AWS capability matrix

This document maps each AWS-backed MCP tool to declared capability IDs, IAM actions,
region mode, risk level, and cost metadata. It is generated deterministically from
tool manifests and the capability registry in `src/aws/capabilities.ts`.

New AWS-backed tools must update capability metadata and regenerate this document
before merge.

The checked-in IAM policy at `infra/aws/iam-readonly-policy.json` must contain exactly
the unique IAM actions listed in this matrix. Drift is enforced by
`src/aws/iam-readonly-policy.test.ts`.

| Tool | Pack | AWS service | AWS action | Region mode | Risk level | Cache TTL (s) | Cost class | Cost control | Cost sensitivity | Estimated unit cost (USD) |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | ---: |
| aws_account_overview | aggregates | ec2 | ec2:DescribeInstances | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |  |
| aws_account_overview | aggregates | lambda | lambda:ListFunctions | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |  |
| aws_account_overview | aggregates | s3 | s3:ListAllMyBuckets | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | low |  |
| aws_cost_overview | aggregates | ce | ce:GetCostAndUsage | single-region | read-only | 1800 | cached-read | paid | paid | 0.01 |
| aws_observability_overview | aggregates | cloudwatch | cloudwatch:DescribeAlarms | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |  |
| aws_observability_overview | aggregates | logs | logs:DescribeLogGroups | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | volume-sensitive |  |
| check_ssm_parameter_inventory | security | ssm | ssm:DescribeParameters | single-region | read-only | 300 | cached-read | low | fanout-sensitive |  |
| compare_ecs_task_image_with_ecr | inventory | ecr | ecr:DescribeImages | single-region | read-only | 300 | cached-read | low | low |  |
| compare_ecs_task_image_with_ecr | inventory | ecr | ecr:DescribeImageScanFindings | single-region | read-only | 300 | cached-read | low | low |  |
| compare_ecs_task_image_with_ecr | inventory | ecr | ecr:GetLifecyclePolicy | single-region | read-only | 300 | cached-read | low | low |  |
| compare_ecs_task_image_with_ecr | inventory | ecs | ecs:DescribeClusters | single-region | read-only | 300 | cached-read | low | low |  |
| compare_ecs_task_image_with_ecr | inventory | ecs | ecs:DescribeServices | single-region | read-only | 300 | cached-read | low | low |  |
| compare_ecs_task_image_with_ecr | inventory | ecs | ecs:DescribeTaskDefinition | single-region | read-only | 300 | cached-read | low | low |  |
| compare_ecs_task_image_with_ecr | inventory | ecs | ecs:DescribeTasks | single-region | read-only | 300 | cached-read | low | volume-sensitive |  |
| compare_ecs_task_image_with_ecr | inventory | ecs | ecs:ListTasks | single-region | read-only | 300 | cached-read | low | volume-sensitive |  |
| get_aws_cost_by_service | cost | ce | ce:GetCostAndUsage | single-region | read-only | 1800 | cached-read | paid | paid | 0.01 |
| get_aws_cost_summary | cost | ce | ce:GetCostAndUsage | single-region | read-only | 1800 | cached-read | paid | paid | 0.01 |
| get_budget_status | cost | budgets | budgets:DescribeBudgets | single-region | read-only | 300 | cached-read | low | low |  |
| get_budget_status | cost | budgets | budgets:DescribeNotificationsForBudget | single-region | read-only | 300 | cached-read | low | low |  |
| get_budget_status | cost | budgets | budgets:DescribeSubscribersForNotification | single-region | read-only | 300 | cached-read | low | low |  |
| get_cloudwatch_alarm_summary | observability | cloudwatch | cloudwatch:DescribeAlarms | single-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |  |
| get_cloudwatch_alarms | observability | cloudwatch | cloudwatch:DescribeAlarms | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |  |
| get_cloudwatch_logs | observability | logs | logs:DescribeLogStreams | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |  |
| get_cloudwatch_logs | observability | logs | logs:FilterLogEvents | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |  |
| get_ecr_image_status | inventory | ecr | ecr:DescribeImages | single-region | read-only | 300 | cached-read | low | low |  |
| get_ecr_image_status | inventory | ecr | ecr:DescribeImageScanFindings | single-region | read-only | 300 | cached-read | low | low |  |
| get_ecr_image_status | inventory | ecr | ecr:GetLifecyclePolicy | single-region | read-only | 300 | cached-read | low | low |  |
| get_ecs_service_health | observability | ecs | ecs:DescribeClusters | single-region | read-only | 300 | cached-read | low | low |  |
| get_ecs_service_health | observability | ecs | ecs:DescribeServices | single-region | read-only | 300 | cached-read | low | low |  |
| get_eventbridge_rules_status | observability | events | events:DescribeRule | single-region | read-only | 300 | cached-read | low | low |  |
| get_eventbridge_rules_status | observability | events | events:ListRules | single-region | read-only | 300 | cached-read | low | fanout-sensitive |  |
| get_eventbridge_rules_status | observability | events | events:ListTargetsByRule | single-region | read-only | 300 | cached-read | low | low |  |
| get_eventbridge_rules_status | observability | scheduler | scheduler:GetSchedule | single-region | read-only | 300 | cached-read | low | low |  |
| get_eventbridge_rules_status | observability | scheduler | scheduler:ListSchedules | single-region | read-only | 300 | cached-read | low | fanout-sensitive |  |
| get_rds_instance_health | database | rds | rds:DescribeDBInstances | single-region | read-only | 300 | cached-read | low | low |  |
| get_rds_instance_health | database | rds | rds:DescribeDBSubnetGroups | single-region | read-only | 300 | cached-read | low | low |  |
| get_rds_metrics | database | cloudwatch | cloudwatch:GetMetricData | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |  |
| get_rds_metrics | database | rds | rds:DescribeDBInstances | single-region | read-only | 300 | cached-read | volume-sensitive | low |  |
| get_recent_log_errors | observability | logs | logs:FilterLogEvents | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |  |
| get_recent_stopped_ecs_tasks | observability | ecs | ecs:DescribeTasks | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |  |
| get_recent_stopped_ecs_tasks | observability | ecs | ecs:ListTasks | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |  |
| get_s3_bucket_posture | security | cloudwatch | cloudwatch:GetMetricData | single-region | read-only | 300 | cached-read | low | volume-sensitive |  |
| get_s3_bucket_posture | security | s3 | s3:GetBucketEncryption | single-region | read-only | 300 | cached-read | low | low |  |
| get_s3_bucket_posture | security | s3 | s3:GetBucketLocation | single-region | read-only | 300 | cached-read | low | low |  |
| get_s3_bucket_posture | security | s3 | s3:GetBucketPolicyStatus | single-region | read-only | 300 | cached-read | low | low |  |
| get_s3_bucket_posture | security | s3 | s3:GetBucketPublicAccessBlock | single-region | read-only | 300 | cached-read | low | low |  |
| get_s3_bucket_posture | security | s3 | s3:GetBucketVersioning | single-region | read-only | 300 | cached-read | low | low |  |
| get_s3_bucket_posture | security | s3 | s3:GetLifecycleConfiguration | single-region | read-only | 300 | cached-read | low | low |  |
| get_ses_configuration_status | security | ses | ses:GetConfigurationSet | single-region | read-only | 300 | cached-read | low | low |  |
| get_ses_configuration_status | security | ses | ses:GetConfigurationSetEventDestinations | single-region | read-only | 300 | cached-read | low | low |  |
| get_sns_topic_status | observability | sns | sns:GetTopicAttributes | single-region | read-only | 300 | cached-read | low | low |  |
| get_sns_topic_status | observability | sns | sns:ListSubscriptionsByTopic | single-region | read-only | 300 | cached-read | low | low |  |
| get_sns_topic_status | observability | sns | sns:ListTopics | single-region | read-only | 300 | cached-read | low | fanout-sensitive |  |
| list_ec2_instances | inventory | ec2 | ec2:DescribeInstances | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |  |
| list_ecs_tasks | observability | ecs | ecs:DescribeTasks | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |  |
| list_ecs_tasks | observability | ecs | ecs:ListTasks | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |  |
| list_lambda_functions | inventory | lambda | lambda:ListFunctions | bounded-multi-region | read-only | 300 | cached-read | fanout-sensitive | fanout-sensitive |  |
| list_log_groups | observability | logs | logs:DescribeLogGroups | single-region | read-only | 300 | cached-read | volume-sensitive | volume-sensitive |  |
| list_s3_buckets | inventory | s3 | s3:ListAllMyBuckets | global | read-only | 300 | cached-read | low | low |  |
