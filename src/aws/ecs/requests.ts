import { awsRequest } from "../client.js";
import type { AwsCredentials } from "../types.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type {
  DescribeClustersResponse,
  DescribeServicesResponse,
  DescribeTaskDefinitionResponse,
  DescribeTasksResponse,
  EcsDesiredStatus,
  ListTasksResponse,
} from "./types.js";

const ECS_TARGET_PREFIX = "AmazonEC2ContainerServiceV20141113";

function ecsHeaders(target: string): Record<string, string> {
  return {
    "X-Amz-Target": `${ECS_TARGET_PREFIX}.${target}`,
    "Content-Type": "application/x-amz-json-1.1",
  };
}

export async function describeClusters(
  clusterNames: string[],
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<DescribeClustersResponse> {
  return awsRequest<DescribeClustersResponse>(
    {
      capability: "ecs:DescribeClusters",
      service: "ecs",
      region,
      method: "POST",
      path: "/",
      headers: ecsHeaders("DescribeClusters"),
      body: { clusters: clusterNames, include: ["TAGS"] },
      execution,
    },
    credentials,
  );
}

export async function describeServices(
  cluster: string,
  serviceNames: string[],
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<DescribeServicesResponse> {
  return awsRequest<DescribeServicesResponse>(
    {
      capability: "ecs:DescribeServices",
      service: "ecs",
      region,
      method: "POST",
      path: "/",
      headers: ecsHeaders("DescribeServices"),
      body: { cluster, services: serviceNames, include: ["TAGS"] },
      execution,
    },
    credentials,
  );
}

export async function listTasks(
  cluster: string,
  options: {
    serviceName?: string;
    desiredStatus?: EcsDesiredStatus;
    maxResults?: number;
    nextToken?: string;
  },
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<ListTasksResponse> {
  const body: Record<string, unknown> = { cluster };
  if (options.serviceName) body.serviceName = options.serviceName;
  if (options.desiredStatus) body.desiredStatus = options.desiredStatus;
  if (options.maxResults !== undefined) body.maxResults = options.maxResults;
  if (options.nextToken) body.nextToken = options.nextToken;

  return awsRequest<ListTasksResponse>(
    {
      capability: "ecs:ListTasks",
      service: "ecs",
      region,
      method: "POST",
      path: "/",
      headers: ecsHeaders("ListTasks"),
      body,
      execution,
    },
    credentials,
  );
}

export async function describeTasks(
  cluster: string,
  taskArns: string[],
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<DescribeTasksResponse> {
  return awsRequest<DescribeTasksResponse>(
    {
      capability: "ecs:DescribeTasks",
      service: "ecs",
      region,
      method: "POST",
      path: "/",
      headers: ecsHeaders("DescribeTasks"),
      body: { cluster, tasks: taskArns, include: ["TAGS"] },
      execution,
    },
    credentials,
  );
}

export async function describeTaskDefinition(
  taskDefinition: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<DescribeTaskDefinitionResponse> {
  return awsRequest<DescribeTaskDefinitionResponse>(
    {
      capability: "ecs:DescribeTaskDefinition",
      service: "ecs",
      region,
      method: "POST",
      path: "/",
      headers: ecsHeaders("DescribeTaskDefinition"),
      body: { taskDefinition },
      execution,
    },
    credentials,
  );
}
