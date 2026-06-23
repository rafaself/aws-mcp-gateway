import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { ECS_CACHE_TTL_SECONDS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import {
  normalizeServiceHealth,
  normalizeStoppedTask,
  normalizeTaskSummary,
  normalizeTaskDefinitionMetadata,
} from "./parse.js";
import {
  describeClusters,
  describeServices,
  describeTaskDefinition,
  describeTasks,
  listTasks,
} from "./requests.js";
import {
  EcsError,
  type EcsListTasksOptions,
  type EcsServiceHealth,
  type EcsStoppedTaskDiagnostic,
  type EcsStoppedTasksOptions,
  type EcsTaskSummary,
} from "./types.js";
import {
  validateClusterName,
  validateLookbackMinutes,
  validateServiceName,
  validateTaskLimit,
  validateDesiredStatus,
} from "./validation.js";

const DESCRIBE_TASKS_BATCH_SIZE = 100;

async function assertClusterExists(
  clusterName: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<void> {
  const response = await describeClusters([clusterName], region, credentials, execution);
  if (response.failures && response.failures.length > 0) {
    throw new EcsError("not_found", `Cluster "${clusterName}" was not found.`);
  }
  if (!response.clusters || response.clusters.length === 0) {
    throw new EcsError("not_found", `Cluster "${clusterName}" was not found.`);
  }
}

async function collectTaskArns(
  clusterName: string,
  options: {
    serviceName?: string;
    desiredStatus?: EcsListTasksOptions["desiredStatus"];
    limit: number;
  },
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<string[]> {
  const taskArns: string[] = [];
  let nextToken: string | undefined;

  while (taskArns.length < options.limit) {
    const remaining = options.limit - taskArns.length;
    const response = await listTasks(
      clusterName,
      {
        serviceName: options.serviceName,
        desiredStatus: options.desiredStatus,
        maxResults: Math.min(remaining, DESCRIBE_TASKS_BATCH_SIZE),
        nextToken,
      },
      region,
      credentials,
      execution,
    );

    const batch = response.taskArns ?? [];
    taskArns.push(...batch);
    nextToken = response.nextToken;
    if (!nextToken || batch.length === 0) break;
  }

  return taskArns.slice(0, options.limit);
}

async function describeTasksInBatches(
  clusterName: string,
  taskArns: string[],
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<EcsTaskSummary[]> {
  const tasks: EcsTaskSummary[] = [];

  for (let i = 0; i < taskArns.length; i += DESCRIBE_TASKS_BATCH_SIZE) {
    const batch = taskArns.slice(i, i + DESCRIBE_TASKS_BATCH_SIZE);
    const response = await describeTasks(clusterName, batch, region, credentials, execution);
    for (const task of response.tasks ?? []) {
      tasks.push(normalizeTaskSummary(task));
    }
  }

  return tasks;
}

export async function getServiceHealth(
  clusterName: string,
  serviceName: string,
  region: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<EcsServiceHealth> {
  validateClusterName(clusterName);
  validateServiceName(serviceName);

  const cacheKey = await buildCacheKey("get_ecs_service_health", {
    clusterName,
    serviceName,
    region,
  });
  const { value: cached } = await cacheReadWithStatus<EcsServiceHealth>(cache, cacheKey, execution);
  if (cached) return cached;

  await assertClusterExists(clusterName, region, credentials, execution);

  const serviceResponse = await describeServices(
    clusterName,
    [serviceName],
    region,
    credentials,
    execution,
  );

  if (serviceResponse.failures && serviceResponse.failures.length > 0) {
    throw new EcsError("not_found", `Service "${serviceName}" was not found in cluster "${clusterName}".`);
  }

  const service = serviceResponse.services?.[0];
  if (!service) {
    throw new EcsError("not_found", `Service "${serviceName}" was not found in cluster "${clusterName}".`);
  }

  const health = normalizeServiceHealth(clusterName, serviceName, region, service);

  if (cache) {
    await cacheSet(cache, cacheKey, health, ECS_CACHE_TTL_SECONDS);
  }

  return health;
}

export async function listEcsTasks(
  clusterName: string,
  options: EcsListTasksOptions,
  region: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<EcsTaskSummary[]> {
  validateClusterName(clusterName);
  const limit = validateTaskLimit(options.limit);
  const desiredStatus = validateDesiredStatus(options.desiredStatus);

  const cacheKey = await buildCacheKey("list_ecs_tasks", {
    clusterName,
    serviceName: options.serviceName ?? "",
    desiredStatus: desiredStatus ?? "",
    limit,
    region,
  });
  const { value: cached } = await cacheReadWithStatus<EcsTaskSummary[]>(cache, cacheKey, execution);
  if (cached) return cached;

  await assertClusterExists(clusterName, region, credentials, execution);

  const taskArns = await collectTaskArns(
    clusterName,
    { serviceName: options.serviceName, desiredStatus, limit },
    region,
    credentials,
    execution,
  );

  if (taskArns.length === 0) {
    if (cache) {
      await cacheSet(cache, cacheKey, [], ECS_CACHE_TTL_SECONDS);
    }
    return [];
  }

  const tasks = await describeTasksInBatches(
    clusterName,
    taskArns,
    region,
    credentials,
    execution,
  );

  if (cache) {
    await cacheSet(cache, cacheKey, tasks, ECS_CACHE_TTL_SECONDS);
  }

  return tasks;
}

function parseStoppedAt(stoppedAt: string | undefined): number | undefined {
  if (!stoppedAt) return undefined;
  const ms = Date.parse(stoppedAt);
  return Number.isNaN(ms) ? undefined : ms;
}

export async function getRecentStoppedEcsTasks(
  clusterName: string,
  options: EcsStoppedTasksOptions,
  region: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<EcsStoppedTaskDiagnostic[]> {
  validateClusterName(clusterName);
  const limit = validateTaskLimit(options.limit);
  const lookbackMinutes = validateLookbackMinutes(options.lookbackMinutes);
  const cutoffMs = Date.now() - lookbackMinutes * 60 * 1000;

  const cacheKey = await buildCacheKey("get_recent_stopped_ecs_tasks", {
    clusterName,
    serviceName: options.serviceName ?? "",
    lookbackMinutes,
    limit,
    region,
  });
  const { value: cached } = await cacheReadWithStatus<EcsStoppedTaskDiagnostic[]>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) return cached;

  await assertClusterExists(clusterName, region, credentials, execution);

  const taskArns = await collectTaskArns(
    clusterName,
    { serviceName: options.serviceName, desiredStatus: "STOPPED", limit },
    region,
    credentials,
    execution,
  );

  if (taskArns.length === 0) {
    if (cache) {
      await cacheSet(cache, cacheKey, [], ECS_CACHE_TTL_SECONDS);
    }
    return [];
  }

  const diagnostics: EcsStoppedTaskDiagnostic[] = [];

  for (let i = 0; i < taskArns.length; i += DESCRIBE_TASKS_BATCH_SIZE) {
    const batch = taskArns.slice(i, i + DESCRIBE_TASKS_BATCH_SIZE);
    const response = await describeTasks(clusterName, batch, region, credentials, execution);
    for (const task of response.tasks ?? []) {
      const stoppedAtMs = parseStoppedAt(task.stoppedAt);
      if (stoppedAtMs !== undefined && stoppedAtMs < cutoffMs) {
        continue;
      }
      diagnostics.push(normalizeStoppedTask(task));
      if (diagnostics.length >= limit) break;
    }
    if (diagnostics.length >= limit) break;
  }

  const result = diagnostics.slice(0, limit);

  if (cache) {
    await cacheSet(cache, cacheKey, result, ECS_CACHE_TTL_SECONDS);
  }

  return result;
}

export async function getTaskDefinitionMetadata(
  taskDefinition: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
) {
  const response = await describeTaskDefinition(taskDefinition, region, credentials, execution);
  return normalizeTaskDefinitionMetadata(response);
}
