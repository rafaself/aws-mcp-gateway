import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { getImageStatus } from "../ecr/index.js";
import { parseEcrImageReference } from "../ecr/parse.js";
import { ECS_CACHE_TTL_SECONDS, ECS_IMAGE_COMPARE_MAX_TASKS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import { normalizeTaskDefinitionMetadata } from "./parse.js";
import {
  describeClusters,
  describeServices,
  describeTaskDefinition,
  describeTasks,
  listTasks,
} from "./requests.js";
import { EcsError, type EcsEcrImageComparisonResult } from "./types.js";
import { validateClusterName, validateServiceName } from "./validation.js";
import { validateRepositoryName } from "../ecr/validation.js";

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

function findTaskDefinitionImage(
  containers: Array<{ name: string; image: string }>,
  repositoryName: string,
): string | undefined {
  for (const container of containers) {
    const parsed = parseEcrImageReference(container.image, repositoryName);
    if (parsed.matchesRepository) {
      return container.image;
    }
  }
  return containers[0]?.image;
}

function collectRunningDigests(
  tasks: Array<{ containers: Array<{ imageDigest?: string }> }>,
): string[] {
  const digests = new Set<string>();
  for (const task of tasks) {
    for (const container of task.containers) {
      if (container.imageDigest) {
        digests.add(container.imageDigest);
      }
    }
  }
  return [...digests].sort();
}

export async function compareServiceImageWithEcr(
  clusterName: string,
  serviceName: string,
  repositoryName: string,
  options: {
    expectedImageDigest?: string;
    region: string;
  },
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<EcsEcrImageComparisonResult> {
  validateClusterName(clusterName);
  validateServiceName(serviceName);
  validateRepositoryName(repositoryName);

  const cacheKey = await buildCacheKey("compare_ecs_task_image_with_ecr", {
    clusterName,
    serviceName,
    repositoryName,
    expectedImageDigest: options.expectedImageDigest ?? "",
    region: options.region,
  });
  const { value: cached } = await cacheReadWithStatus<EcsEcrImageComparisonResult>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) {
    return cached;
  }

  await assertClusterExists(clusterName, options.region, credentials, execution);

  const serviceResponse = await describeServices(
    clusterName,
    [serviceName],
    options.region,
    credentials,
    execution,
  );

  if (serviceResponse.failures && serviceResponse.failures.length > 0) {
    throw new EcsError("not_found", `Service "${serviceName}" was not found in cluster "${clusterName}".`);
  }

  const service = serviceResponse.services?.[0];
  if (!service?.taskDefinition) {
    throw new EcsError("not_found", `Service "${serviceName}" was not found in cluster "${clusterName}".`);
  }

  const taskDefResponse = await describeTaskDefinition(
    service.taskDefinition,
    options.region,
    credentials,
    execution,
  );
  const taskDef = normalizeTaskDefinitionMetadata(taskDefResponse);
  const taskDefinitionImage = taskDef
    ? findTaskDefinitionImage(taskDef.containers, repositoryName)
    : undefined;

  const listResponse = await listTasks(
    clusterName,
    {
      serviceName,
      desiredStatus: "RUNNING",
      maxResults: ECS_IMAGE_COMPARE_MAX_TASKS,
    },
    options.region,
    credentials,
    execution,
  );

  let runningTaskImageDigests: string[] = [];
  const taskArns = listResponse.taskArns ?? [];
  if (taskArns.length > 0) {
    const tasksResponse = await describeTasks(
      clusterName,
      taskArns,
      options.region,
      credentials,
      execution,
    );
    runningTaskImageDigests = collectRunningDigests(
      (tasksResponse.tasks ?? []).map((task) => ({
        containers: (task.containers ?? []).map((container) => ({
          imageDigest: container.imageDigest,
        })),
      })),
    );
  }

  const imageRef = taskDefinitionImage
    ? parseEcrImageReference(taskDefinitionImage, repositoryName)
    : undefined;

  const ecrStatus = await getImageStatus(
    repositoryName,
    {
      region: options.region,
      imageTag: imageRef?.tag,
      imageDigest: imageRef?.digest,
    },
    credentials,
    cache,
    execution,
  );

  const ecrDigest = ecrStatus.imageDigest;
  const matchesEcrDigest =
    Boolean(ecrDigest) &&
    runningTaskImageDigests.length > 0 &&
    runningTaskImageDigests.every((digest) => digest === ecrDigest);

  let matchesExpectedDigest: boolean | null = null;
  if (options.expectedImageDigest) {
    matchesExpectedDigest =
      runningTaskImageDigests.length > 0 &&
      runningTaskImageDigests.every((digest) => digest === options.expectedImageDigest);
  }

  const result: EcsEcrImageComparisonResult = {
    region: options.region,
    clusterName,
    serviceName,
    repositoryName,
    ...(taskDefinitionImage ? { taskDefinitionImage } : {}),
    runningTaskImageDigests,
    ...(ecrDigest ? { ecrImageDigest: ecrDigest } : {}),
    ...(ecrStatus.tags ? { ecrImageTags: ecrStatus.tags } : {}),
    ecrImageFound: ecrStatus.found,
    matchesEcrDigest,
    matchesExpectedDigest,
  };

  if (cache) {
    await cacheSet(cache, cacheKey, result, ECS_CACHE_TTL_SECONDS);
  }

  return result;
}
