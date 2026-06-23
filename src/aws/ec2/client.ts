import { resolveRegions } from "../../security/regions.js";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { EC2_CACHE_TTL_SECONDS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import { ec2Fetch } from "./fetch.js";
import { parseInstance } from "./parse.js";
import { validateStateFilters, buildDescribeInstancesParams } from "./requests.js";
import type {
  Ec2ListInstancesOptions,
  Ec2Instance,
  Ec2DescribeInstancesResponse,
} from "./types.js";

export async function listInstances(
  options: Ec2ListInstancesOptions,
  allowedRegions: string[],
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<Ec2Instance[]> {
  if (options.stateFilter && options.stateFilter.length > 0) {
    validateStateFilters(options.stateFilter);
  }

  const regions = resolveRegions(options.regions, allowedRegions);
  const sortedRegions = [...regions].sort();
  const sortedStateFilter = options.stateFilter?.slice().sort() ?? [];

  const cacheKey = await buildCacheKey("list_ec2_instances", {
    regions: sortedRegions,
    stateFilter: sortedStateFilter,
  });
  const { value: cached } = await cacheReadWithStatus<Ec2Instance[]>(cache, cacheKey, execution);
  if (cached) return cached;

  const params = buildDescribeInstancesParams(options.stateFilter ?? []);

  const outcomes = await Promise.allSettled(
    regions.map((region) =>
      ec2Fetch<Ec2DescribeInstancesResponse>(
        "ec2:DescribeInstances",
        "DescribeInstances",
        params,
        region,
        credentials,
        execution,
      )
        .then((response) => {
          const reservations =
            response.DescribeInstancesResponse?.reservationSet?.item ?? [];
          const instances: Ec2Instance[] = [];

          for (const reservation of reservations) {
            const rawInstances = reservation.instancesSet?.item ?? [];
            for (const raw of rawInstances) {
              instances.push(parseInstance(raw, region));
            }
          }

          return instances;
        }),
    ),
  );

  const allInstances: Ec2Instance[] = [];
  const errors: Array<{ region: string; reason: unknown }> = [];

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    if (outcome.status === "fulfilled") {
      allInstances.push(...outcome.value);
    } else {
      errors.push({ region: regions[i], reason: outcome.reason });
    }
  }

  if (allInstances.length === 0 && errors.length > 0) {
    const firstError = errors[0].reason;
    if (firstError instanceof AwsRequestError) {
      throw firstError;
    }
    throw new AwsRequestError({
      code: "aws_request_failed",
      message: "EC2 request failed in all regions.",
      retryable: false,
      statusCode: 0,
      service: "ec2",
    });
  }

  allInstances.sort((a, b) => {
    const regionCmp = a.region.localeCompare(b.region);
    if (regionCmp !== 0) return regionCmp;
    return a.instanceId.localeCompare(b.instanceId);
  });

  if (cache) {
    const cacheKey = await buildCacheKey("list_ec2_instances", {
      regions: sortedRegions,
      stateFilter: sortedStateFilter,
    });
    await cacheSet(cache, cacheKey, allInstances, EC2_CACHE_TTL_SECONDS);
  }

  return allInstances;
}
