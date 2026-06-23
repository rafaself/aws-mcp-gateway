import { getServiceHealth, listEcsTasks } from "../../../../aws/ecs/index.js";
import { getInstanceHealth } from "../../../../aws/rds/index.js";
import { filterLogEvents } from "../../../../aws/logs/index.js";
import { checkParameterInventory } from "../../../../aws/ssm/index.js";
import { getImageStatus } from "../../../../aws/ecr/index.js";
import { compareServiceImageWithEcr } from "../../../../aws/ecs/index.js";
import { getBucketPosture } from "../../../../aws/s3/index.js";
import { getConfigurationStatus } from "../../../../aws/ses/index.js";
import { getTopicStatus } from "../../../../aws/sns/index.js";
import { getRulesStatus } from "../../../../aws/eventbridge/index.js";
import { summarizeAlarms } from "../../../../aws/cloudwatch/index.js";
import { getBudgetStatus } from "../../../../aws/budgets/index.js";
import { LOGS_MAX_EVENTS, LOGS_MAX_HOURS } from "../../../../security/limits.js";
import {
  authStrategyLabel,
  resolveBlockCredentials,
} from "../../../../profiles/access.js";
import type { ApplicationOpsContext, SectionResult } from "./types.js";
import { profileSummary, redactErrorMessage, sectionError, sectionOk, sectionSkipped } from "./types.js";

export type ComputeStatusData = {
  serviceHealth: Awaited<ReturnType<typeof getServiceHealth>>;
  runningTaskCount: number;
  sampleTasks: Array<{
    taskId: string;
    lastStatus: string;
    healthStatus?: string;
  }>;
};

export async function buildComputeStatus(
  ops: ApplicationOpsContext,
): Promise<SectionResult<ComputeStatusData>> {
  const ecs = ops.profile.resources.ecs;
  if (!ecs) {
    return sectionSkipped();
  }

  try {
    const credentials = await resolveBlockCredentials(ops.ctx, ops.profile);
    const authStrategy = authStrategyLabel(undefined, ops.profile.auth);

    const serviceHealth = await getServiceHealth(
      ecs.clusterName,
      ecs.serviceName,
      ops.region,
      credentials,
      ops.ctx.cache,
      ops.ctx.execution,
    );

    const tasks = await listEcsTasks(
      ecs.clusterName,
      { serviceName: ecs.serviceName, desiredStatus: "RUNNING", limit: 5 },
      ops.region,
      credentials,
      ops.ctx.cache,
      ops.ctx.execution,
    );

    return sectionOk(
      {
        serviceHealth,
        runningTaskCount: tasks.length,
        sampleTasks: tasks.map((task) => ({
          taskId: task.taskId,
          lastStatus: task.lastStatus,
          healthStatus: task.healthStatus,
        })),
      },
      authStrategy,
    );
  } catch (err) {
    return sectionError(redactErrorMessage(err));
  }
}

export type DatabaseStatusData = Awaited<ReturnType<typeof getInstanceHealth>>;

export async function buildDatabaseStatus(
  ops: ApplicationOpsContext,
): Promise<SectionResult<DatabaseStatusData>> {
  const rds = ops.profile.resources.rds;
  if (!rds) {
    return sectionSkipped();
  }

  try {
    const credentials = await resolveBlockCredentials(ops.ctx, ops.profile);
    const authStrategy = authStrategyLabel(undefined, ops.profile.auth);
    const health = await getInstanceHealth(
      rds.dbInstanceIdentifier,
      ops.region,
      credentials,
      ops.ctx.cache,
      ops.ctx.execution,
    );
    return sectionOk(health, authStrategy);
  } catch (err) {
    return sectionError(redactErrorMessage(err));
  }
}

export type ApplicationLogsOptions = {
  hours?: number;
  limit?: number;
};

export type ApplicationLogsData = {
  logGroupName: string;
  hours: number;
  count: number;
  events: Array<{
    timestamp: string;
    logStreamName: string;
    message: string;
  }>;
};

export async function buildApplicationLogs(
  ops: ApplicationOpsContext,
  options: ApplicationLogsOptions = {},
): Promise<SectionResult<ApplicationLogsData>> {
  const logGroupName = ops.profile.resources.ecs?.logGroupName;
  if (!logGroupName) {
    return sectionSkipped();
  }

  const hours = Math.min(Math.max(options.hours ?? 1, 1), LOGS_MAX_HOURS);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), LOGS_MAX_EVENTS);

  try {
    const credentials = await resolveBlockCredentials(ops.ctx, ops.profile);
    const authStrategy = authStrategyLabel(undefined, ops.profile.auth);
    const now = Date.now();
    const startTime = now - hours * 60 * 60 * 1000;

    const { events } = await filterLogEvents(
      logGroupName,
      { startTime, endTime: now, limit },
      ops.region,
      credentials,
      ops.ctx.cache,
      ops.ctx.execution,
    );

    return sectionOk(
      {
        logGroupName,
        hours,
        count: events.length,
        events: events.map((event) => ({
          timestamp: event.timestamp,
          logStreamName: event.logStreamName,
          message: event.message,
        })),
      },
      authStrategy,
    );
  } catch (err) {
    return sectionError(redactErrorMessage(err));
  }
}

export type SecretInventoryData = {
  parameterPrefix: string;
  missingCount: number;
  parameters: Awaited<ReturnType<typeof checkParameterInventory>>["parameters"];
};

export async function buildSecretInventory(
  ops: ApplicationOpsContext,
): Promise<SectionResult<SecretInventoryData>> {
  const ssm = ops.profile.resources.ssm;
  if (!ssm?.requiredParameterNames || ssm.requiredParameterNames.length === 0) {
    return sectionSkipped();
  }

  try {
    const credentials = await resolveBlockCredentials(ops.ctx, ops.profile);
    const authStrategy = authStrategyLabel(undefined, ops.profile.auth);
    const inventory = await checkParameterInventory(
      {
        parameterPrefix: ssm.parameterPrefix,
        requiredParameterNames: ssm.requiredParameterNames,
        region: ops.region,
        cacheTool: "get_application_secret_inventory",
      },
      credentials,
      ops.ctx.cache,
      ops.ctx.execution,
    );

    return sectionOk(
      {
        parameterPrefix: inventory.parameterPrefix,
        missingCount: inventory.missingCount,
        parameters: inventory.parameters,
      },
      authStrategy,
    );
  } catch (err) {
    return sectionError(redactErrorMessage(err));
  }
}

export type ArtifactStatusData =
  | {
      mode: "ecr";
      imageStatus: Awaited<ReturnType<typeof getImageStatus>>;
    }
  | {
      mode: "ecs-ecr-compare";
      compare: Awaited<ReturnType<typeof compareServiceImageWithEcr>>;
    };

export async function buildArtifactStatus(
  ops: ApplicationOpsContext,
): Promise<SectionResult<ArtifactStatusData>> {
  const ecr = ops.profile.resources.ecr;
  if (!ecr) {
    return sectionSkipped();
  }

  try {
    const credentials = await resolveBlockCredentials(ops.ctx, ops.profile);
    const authStrategy = authStrategyLabel(undefined, ops.profile.auth);
    const ecs = ops.profile.resources.ecs;

    if (ecs) {
      const compare = await compareServiceImageWithEcr(
        ecs.clusterName,
        ecs.serviceName,
        ecr.repositoryName,
        { region: ops.region },
        credentials,
        ops.ctx.cache,
        ops.ctx.execution,
      );
      return sectionOk({ mode: "ecs-ecr-compare", compare }, authStrategy);
    }

    const imageStatus = await getImageStatus(
      ecr.repositoryName,
      { region: ops.region },
      credentials,
      ops.ctx.cache,
      ops.ctx.execution,
    );
    return sectionOk({ mode: "ecr", imageStatus }, authStrategy);
  } catch (err) {
    return sectionError(redactErrorMessage(err));
  }
}

export type AlertingStatusData = {
  alarms?: Awaited<ReturnType<typeof summarizeAlarms>>;
  sns?: Awaited<ReturnType<typeof getTopicStatus>>;
  eventBridge?: Awaited<ReturnType<typeof getRulesStatus>>;
};

export async function buildAlertingStatus(
  ops: ApplicationOpsContext,
  options?: { includeRegionalAlarms?: boolean },
): Promise<SectionResult<AlertingStatusData>> {
  const sns = ops.profile.resources.sns;
  const eventbridge = ops.profile.resources.eventbridge;
  const hasSns = Boolean(sns?.topicName || sns?.topicArn);
  const hasEventBridge = Boolean(
    eventbridge?.ruleNamePrefix || eventbridge?.scheduleNamePrefix,
  );
  const includeAlarms = options?.includeRegionalAlarms ?? false;

  if (!hasSns && !hasEventBridge && !includeAlarms) {
    return sectionSkipped();
  }

  try {
    const credentials = await resolveBlockCredentials(ops.ctx, ops.profile);
    const authStrategy = authStrategyLabel(undefined, ops.profile.auth);
    const data: AlertingStatusData = {};

    if (includeAlarms || hasSns || hasEventBridge) {
      data.alarms = await summarizeAlarms(
        ops.region,
        { limit: 20 },
        credentials,
        ops.ctx.cache,
        ops.ctx.execution,
      );
    }

    if (hasSns && sns) {
      data.sns = await getTopicStatus(
        {
          topicName: sns.topicName,
          topicArn: sns.topicArn,
          region: ops.region,
        },
        credentials,
        ops.ctx.cache,
        ops.ctx.execution,
      );
    }

    if (hasEventBridge && eventbridge) {
      data.eventBridge = await getRulesStatus(
        {
          region: ops.region,
          ruleNamePrefix: eventbridge.ruleNamePrefix,
          scheduleNamePrefix: eventbridge.scheduleNamePrefix,
          limit: 20,
        },
        credentials,
        ops.ctx.cache,
        ops.ctx.execution,
      );
    }

    return sectionOk(data, authStrategy);
  } catch (err) {
    return sectionError(redactErrorMessage(err));
  }
}

export type CostStatusData = Awaited<ReturnType<typeof getBudgetStatus>>;

export async function buildCostStatus(
  ops: ApplicationOpsContext,
): Promise<SectionResult<CostStatusData>> {
  const budget = ops.profile.resources.budget;
  if (!budget) {
    return sectionSkipped();
  }
  if (!budget.accountId) {
    return sectionError("Budget accountId is not configured in the profile.");
  }

  try {
    const credentials = await resolveBlockCredentials(ops.ctx, ops.profile);
    const authStrategy = authStrategyLabel(undefined, ops.profile.auth);
    const status = await getBudgetStatus(
      budget.budgetName,
      budget.accountId,
      credentials,
      ops.ctx.cache,
      ops.ctx.execution,
    );
    return sectionOk(status, authStrategy);
  } catch (err) {
    return sectionError(redactErrorMessage(err));
  }
}

export type S3PostureData = Awaited<ReturnType<typeof getBucketPosture>>;

export async function buildS3Posture(
  ops: ApplicationOpsContext,
): Promise<SectionResult<S3PostureData>> {
  const s3 = ops.profile.resources.s3;
  if (!s3) {
    return sectionSkipped();
  }

  try {
    const credentials = await resolveBlockCredentials(ops.ctx, ops.profile);
    const authStrategy = authStrategyLabel(undefined, ops.profile.auth);
    const posture = await getBucketPosture(
      s3.bucketName,
      ops.region,
      credentials,
      ops.ctx.cache,
      ops.ctx.execution,
    );
    return sectionOk(posture, authStrategy);
  } catch (err) {
    return sectionError(redactErrorMessage(err));
  }
}

export type SesStatusData = Awaited<ReturnType<typeof getConfigurationStatus>>;

export async function buildSesStatus(
  ops: ApplicationOpsContext,
): Promise<SectionResult<SesStatusData>> {
  const ses = ops.profile.resources.ses;
  if (!ses) {
    return sectionSkipped();
  }

  try {
    const credentials = await resolveBlockCredentials(ops.ctx, ops.profile, ses.auth);
    const authStrategy = authStrategyLabel(ses.auth, ops.profile.auth);
    const status = await getConfigurationStatus(
      ses.configurationSetName,
      ops.region,
      credentials,
      ops.ctx.cache,
      ops.ctx.execution,
      {
        roleArn:
          ses.auth?.strategy === "assume-role" ? ses.auth.roleArn : undefined,
      },
    );
    return sectionOk(status, authStrategy);
  } catch (err) {
    return sectionError(redactErrorMessage(err));
  }
}

export type EnvironmentOverviewResult = {
  profile: ReturnType<typeof profileSummary>;
  compute: SectionResult<ComputeStatusData>;
  database: SectionResult<DatabaseStatusData>;
  logs: SectionResult<ApplicationLogsData>;
  ssm: SectionResult<SecretInventoryData>;
  artifacts: SectionResult<ArtifactStatusData>;
  s3: SectionResult<S3PostureData>;
  ses: SectionResult<SesStatusData>;
  alerting: SectionResult<AlertingStatusData>;
  budget: SectionResult<CostStatusData>;
};

export async function buildEnvironmentOverview(
  ops: ApplicationOpsContext,
  logOptions?: ApplicationLogsOptions,
): Promise<EnvironmentOverviewResult> {
  const [
    compute,
    database,
    logs,
    ssm,
    artifacts,
    s3,
    ses,
    alerting,
    budget,
  ] = await Promise.all([
    buildComputeStatus(ops),
    buildDatabaseStatus(ops),
    buildApplicationLogs(ops, logOptions),
    buildSecretInventory(ops),
    buildArtifactStatus(ops),
    buildS3Posture(ops),
    buildSesStatus(ops),
    buildAlertingStatus(ops, { includeRegionalAlarms: true }),
    buildCostStatus(ops),
  ]);

  return {
    profile: profileSummary(ops.profile),
    compute,
    database,
    logs,
    ssm,
    artifacts,
    s3,
    ses,
    alerting,
    budget,
  };
}
