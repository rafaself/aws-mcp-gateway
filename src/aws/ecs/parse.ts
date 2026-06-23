import type {
  DescribeTaskDefinitionResponse,
  DescribeTasksResponse,
  DescribeServicesResponse,
  EcsContainerStatus,
  EcsServiceEvent,
  EcsServiceHealth,
  EcsStoppedTaskDiagnostic,
  EcsTaskSummary,
} from "./types.js";
import { ECS_MAX_SERVICE_EVENTS } from "../../security/limits.js";

export function extractArnSuffix(arn: string): string {
  const slash = arn.lastIndexOf("/");
  if (slash >= 0 && slash < arn.length - 1) {
    return arn.slice(slash + 1);
  }
  const colon = arn.lastIndexOf(":");
  if (colon >= 0 && colon < arn.length - 1) {
    return arn.slice(colon + 1);
  }
  return arn;
}

export function normalizeTaskDefinitionRef(arnOrFamily: string | undefined): string {
  if (!arnOrFamily) return "";
  if (!arnOrFamily.startsWith("arn:")) {
    return arnOrFamily;
  }
  return extractArnSuffix(arnOrFamily);
}

export function normalizeContainers(
  containers: Array<{
    name?: string;
    lastStatus?: string;
    exitCode?: number;
    reason?: string;
  }> | undefined,
): EcsContainerStatus[] {
  if (!containers) return [];
  return containers.map((c) => ({
    name: c.name ?? "",
    lastStatus: c.lastStatus ?? "",
    ...(c.exitCode !== undefined ? { exitCode: c.exitCode } : {}),
    ...(c.reason ? { reason: c.reason } : {}),
  }));
}

export function normalizeServiceEvents(
  events: Array<{ id?: string; createdAt?: string; message?: string }> | undefined,
): EcsServiceEvent[] {
  if (!events || events.length === 0) return [];
  return events
    .slice(0, ECS_MAX_SERVICE_EVENTS)
    .map((e) => ({
      id: e.id ?? "",
      createdAt: e.createdAt ?? "",
      message: e.message ?? "",
    }));
}

export function normalizeServiceHealth(
  clusterName: string,
  serviceName: string,
  region: string,
  service: NonNullable<DescribeServicesResponse["services"]>[number],
): EcsServiceHealth {
  const primaryDeployment = service.deployments?.[0];
  const capacityProviders = service.capacityProviderStrategy
    ?.map((s) => s.capacityProvider)
    .filter((p): p is string => Boolean(p));

  return {
    clusterName,
    serviceName,
    region,
    desiredCount: service.desiredCount ?? 0,
    runningCount: service.runningCount ?? 0,
    pendingCount: service.pendingCount ?? 0,
    deploymentStatus: primaryDeployment?.status ?? service.status ?? "",
    rolloutState: primaryDeployment?.rolloutState ?? "",
    taskDefinition: normalizeTaskDefinitionRef(service.taskDefinition),
    ...(service.launchType ? { launchType: service.launchType } : {}),
    ...(capacityProviders && capacityProviders.length > 0
      ? { capacityProviders }
      : {}),
    events: normalizeServiceEvents(service.events),
  };
}

export function normalizeTaskSummary(
  task: NonNullable<DescribeTasksResponse["tasks"]>[number],
): EcsTaskSummary {
  return {
    taskId: extractArnSuffix(task.taskArn ?? ""),
    taskDefinition: normalizeTaskDefinitionRef(task.taskDefinitionArn),
    lastStatus: task.lastStatus ?? "",
    desiredStatus: task.desiredStatus ?? "",
    ...(task.healthStatus ? { healthStatus: task.healthStatus } : {}),
    ...(task.startedAt ? { startedAt: task.startedAt } : {}),
    ...(task.stoppedAt ? { stoppedAt: task.stoppedAt } : {}),
    ...(task.stopCode ? { stopCode: task.stopCode } : {}),
    ...(task.stoppedReason ? { stoppedReason: task.stoppedReason } : {}),
    ...(task.availabilityZone ? { availabilityZone: task.availabilityZone } : {}),
    containers: normalizeContainers(task.containers),
  };
}

export function normalizeStoppedTask(
  task: NonNullable<DescribeTasksResponse["tasks"]>[number],
): EcsStoppedTaskDiagnostic {
  return {
    taskId: extractArnSuffix(task.taskArn ?? ""),
    taskDefinition: normalizeTaskDefinitionRef(task.taskDefinitionArn),
    ...(task.stoppedReason ? { stoppedReason: task.stoppedReason } : {}),
    ...(task.stopCode ? { stopCode: task.stopCode } : {}),
    ...(task.startedAt ? { startedAt: task.startedAt } : {}),
    ...(task.stoppedAt ? { stoppedAt: task.stoppedAt } : {}),
    containers: normalizeContainers(task.containers),
  };
}

export type SafeTaskDefinitionMetadata = {
  family: string;
  revision: number;
  cpu?: string;
  memory?: string;
  containers: Array<{
    name: string;
    image: string;
    cpu?: number;
    memory?: number;
    memoryReservation?: number;
  }>;
};

export function normalizeTaskDefinitionMetadata(
  response: DescribeTaskDefinitionResponse,
): SafeTaskDefinitionMetadata | undefined {
  const td = response.taskDefinition;
  if (!td) return undefined;

  return {
    family: td.family ?? "",
    revision: td.revision ?? 0,
    ...(td.cpu ? { cpu: td.cpu } : {}),
    ...(td.memory ? { memory: td.memory } : {}),
    containers: (td.containerDefinitions ?? []).map((c) => ({
      name: c.name ?? "",
      image: c.image ?? "",
      ...(c.cpu !== undefined ? { cpu: c.cpu } : {}),
      ...(c.memory !== undefined ? { memory: c.memory } : {}),
      ...(c.memoryReservation !== undefined
        ? { memoryReservation: c.memoryReservation }
        : {}),
    })),
  };
}
