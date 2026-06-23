import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export type EcsDesiredStatus = "RUNNING" | "PENDING" | "STOPPED";

export interface EcsServiceEvent {
  id: string;
  createdAt: string;
  message: string;
}

export interface EcsServiceHealth {
  clusterName: string;
  serviceName: string;
  region: string;
  desiredCount: number;
  runningCount: number;
  pendingCount: number;
  deploymentStatus: string;
  rolloutState: string;
  taskDefinition: string;
  launchType?: string;
  capacityProviders?: string[];
  events: EcsServiceEvent[];
}

export interface EcsContainerStatus {
  name: string;
  lastStatus: string;
  exitCode?: number;
  reason?: string;
}

export interface EcsTaskSummary {
  taskId: string;
  taskDefinition: string;
  lastStatus: string;
  desiredStatus: string;
  healthStatus?: string;
  startedAt?: string;
  stoppedAt?: string;
  stopCode?: string;
  stoppedReason?: string;
  availabilityZone?: string;
  containers: EcsContainerStatus[];
}

export interface EcsStoppedTaskDiagnostic {
  taskId: string;
  taskDefinition: string;
  stoppedReason?: string;
  stopCode?: string;
  startedAt?: string;
  stoppedAt?: string;
  containers: EcsContainerStatus[];
}

export interface EcsListTasksOptions {
  serviceName?: string;
  desiredStatus?: EcsDesiredStatus;
  limit?: number;
}

export interface EcsStoppedTasksOptions {
  serviceName?: string;
  lookbackMinutes?: number;
  limit?: number;
}

export interface DescribeClustersResponse {
  clusters?: Array<{
    clusterName?: string;
    status?: string;
  }>;
  failures?: Array<{ arn?: string; reason?: string }>;
}

export interface DescribeServicesResponse {
  services?: Array<{
    serviceName?: string;
    clusterArn?: string;
    status?: string;
    desiredCount?: number;
    runningCount?: number;
    pendingCount?: number;
    launchType?: string;
    taskDefinition?: string;
    capacityProviderStrategy?: Array<{ capacityProvider?: string }>;
    deployments?: Array<{
      status?: string;
      rolloutState?: string;
      desiredCount?: number;
      runningCount?: number;
      pendingCount?: number;
    }>;
    events?: Array<{
      id?: string;
      createdAt?: string;
      message?: string;
    }>;
  }>;
  failures?: Array<{ arn?: string; reason?: string }>;
}

export interface ListTasksResponse {
  taskArns?: string[];
  nextToken?: string;
}

export interface DescribeTasksResponse {
  tasks?: Array<{
    taskArn?: string;
    clusterArn?: string;
    taskDefinitionArn?: string;
    lastStatus?: string;
    desiredStatus?: string;
    healthStatus?: string;
    startedAt?: string;
    stoppedAt?: string;
    stopCode?: string;
    stoppedReason?: string;
    availabilityZone?: string;
    containers?: Array<{
      name?: string;
      lastStatus?: string;
      exitCode?: number;
      reason?: string;
    }>;
  }>;
  failures?: Array<{ arn?: string; reason?: string }>;
}

export interface DescribeTaskDefinitionResponse {
  taskDefinition?: {
    family?: string;
    revision?: number;
    cpu?: string;
    memory?: string;
    containerDefinitions?: Array<{
      name?: string;
      image?: string;
      cpu?: number;
      memory?: number;
      memoryReservation?: number;
      environment?: Array<{ name?: string; value?: string }>;
      secrets?: Array<{ name?: string; valueFrom?: string }>;
      secretOptions?: Array<{ name?: string; valueFrom?: string }>;
    }>;
  };
}

export class EcsError extends ValidationError {
  constructor(code: GatewayErrorCode, message: string) {
    super(code, message);
    this.name = "EcsError";
  }
}
