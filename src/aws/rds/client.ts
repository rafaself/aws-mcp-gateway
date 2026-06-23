import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { RDS_CACHE_TTL_SECONDS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import { rdsFetch } from "./fetch.js";
import { extractDbInstances, normalizeInstanceHealth, extractDbSubnetGroups } from "./parse.js";
import {
  buildDescribeDbInstancesParams,
  buildDescribeDbSubnetGroupsParams,
} from "./requests.js";
import {
  RdsError,
  type RdsDescribeDbInstancesResponse,
  type RdsDescribeDbSubnetGroupsResponse,
  type RdsInstanceHealth,
} from "./types.js";
import { validateDbInstanceIdentifier } from "./validation.js";

async function describeDbInstance(
  dbInstanceIdentifier: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
) {
  const response = await rdsFetch<RdsDescribeDbInstancesResponse>(
    "rds:DescribeDBInstances",
    buildDescribeDbInstancesParams(dbInstanceIdentifier),
    region,
    credentials,
    execution,
  );

  const instances = extractDbInstances(response);
  if (instances.length === 0) {
    throw new RdsError(
      "not_found",
      `DB instance "${dbInstanceIdentifier}" was not found in ${region}.`,
    );
  }

  return instances[0];
}

async function describeSubnetGroupVpcId(
  dbSubnetGroupName: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<string | undefined> {
  const response = await rdsFetch<RdsDescribeDbSubnetGroupsResponse>(
    "rds:DescribeDBSubnetGroups",
    buildDescribeDbSubnetGroupsParams(dbSubnetGroupName),
    region,
    credentials,
    execution,
  );

  const groups = extractDbSubnetGroups(response);
  return groups[0]?.VpcId;
}

export async function assertInstanceExists(
  dbInstanceIdentifier: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<void> {
  validateDbInstanceIdentifier(dbInstanceIdentifier);
  await describeDbInstance(dbInstanceIdentifier, region, credentials, execution);
}

export async function getInstanceHealth(
  dbInstanceIdentifier: string,
  region: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<RdsInstanceHealth> {
  validateDbInstanceIdentifier(dbInstanceIdentifier);

  const cacheKey = await buildCacheKey("get_rds_instance_health", {
    dbInstanceIdentifier,
    region,
  });
  const { value: cached } = await cacheReadWithStatus<RdsInstanceHealth>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) {
    return cached;
  }

  const raw = await describeDbInstance(dbInstanceIdentifier, region, credentials, execution);
  const subnetGroupName = raw.DBSubnetGroup?.DBSubnetGroupName;
  let vpcId: string | undefined;

  if (subnetGroupName) {
    vpcId = await describeSubnetGroupVpcId(
      subnetGroupName,
      region,
      credentials,
      execution,
    );
  }

  const health = normalizeInstanceHealth(raw, region, {
    dbSubnetGroupName: subnetGroupName,
    vpcId,
  });

  if (cache) {
    await cacheSet(cache, cacheKey, health, RDS_CACHE_TTL_SECONDS);
  }

  return health;
}
