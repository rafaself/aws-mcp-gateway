import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { redactSensitiveText } from "../../security/redaction.js";
import { SSM_CACHE_TTL_SECONDS, SSM_MAX_DESCRIBE_RESULTS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import { awsRequest } from "../client.js";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";
import {
  buildMissingParameterEntry,
  indexParametersByName,
  normalizeParameterMetadata,
} from "./parse.js";
import { buildDescribeParametersBody, SSM_DESCRIBE_PARAMETERS_TARGET } from "./requests.js";
import {
  SsmError,
  type SsmDescribeParametersResponse,
  type SsmParameterInventoryResult,
  type SsmRawParameterMetadata,
} from "./types.js";
import {
  buildParameterPath,
  validateParameterPrefix,
  validateRequiredParameterNames,
} from "./validation.js";

async function describeParametersUnderPrefix(
  parameterPrefix: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<SsmRawParameterMetadata[]> {
  const discovered: SsmRawParameterMetadata[] = [];
  let nextToken: string | undefined;

  do {
    const response = await awsRequest<SsmDescribeParametersResponse>(
      {
        capability: "ssm:DescribeParameters",
        service: "ssm",
        region,
        method: "POST",
        path: "/",
        headers: {
          "X-Amz-Target": SSM_DESCRIBE_PARAMETERS_TARGET,
          "Content-Type": "application/x-amz-json-1.1",
        },
        body: buildDescribeParametersBody(parameterPrefix, nextToken),
        execution,
      },
      credentials,
    );

    discovered.push(...(response.Parameters ?? []));
    nextToken = response.NextToken;

    if (discovered.length >= SSM_MAX_DESCRIBE_RESULTS) {
      break;
    }
  } while (nextToken);

  return discovered.slice(0, SSM_MAX_DESCRIBE_RESULTS);
}

function mapAwsRequestError(err: unknown): never {
  if (err instanceof AwsRequestError) {
    const message = redactSensitiveText(err.message);
    if (err.statusCode === 400 || err.statusCode === 404) {
      throw new SsmError("not_found", message || "SSM parameters were not found.");
    }
    throw new SsmError("aws_request_failed", message || "AWS SSM request failed.");
  }
  throw err;
}

export async function checkParameterInventory(
  options: {
    parameterPrefix: string;
    requiredParameterNames: string[];
    region: string;
    cacheTool?: string;
  },
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<SsmParameterInventoryResult> {
  const parameterPrefix = validateParameterPrefix(options.parameterPrefix);
  const requiredParameterNames = validateRequiredParameterNames(options.requiredParameterNames);
  const region = options.region;
  const cacheTool = options.cacheTool ?? "check_ssm_parameter_inventory";

  const cacheKey = await buildCacheKey(cacheTool, {
    parameterPrefix,
    requiredParameterNames: [...requiredParameterNames].sort(),
    region,
  });
  const { value: cached } = await cacheReadWithStatus<SsmParameterInventoryResult>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) {
    return cached;
  }

  const requiredPaths = requiredParameterNames.map((name) =>
    buildParameterPath(parameterPrefix, name),
  );

  let discovered: SsmRawParameterMetadata[];
  try {
    discovered = await describeParametersUnderPrefix(
      parameterPrefix,
      region,
      credentials,
      execution,
    );
  } catch (err) {
    mapAwsRequestError(err);
  }

  const byName = indexParametersByName(discovered);
  const parameters = requiredParameterNames.map((name, index) => {
    const path = requiredPaths[index];
    const raw = byName.get(path);
    if (!raw) {
      return buildMissingParameterEntry(name, path);
    }
    return normalizeParameterMetadata(raw, name);
  });

  const missingCount = parameters.filter((entry) => !entry.exists).length;
  const result: SsmParameterInventoryResult = {
    region,
    parameterPrefix,
    missingCount,
    parameters,
  };

  if (cache) {
    await cacheSet(cache, cacheKey, result, SSM_CACHE_TTL_SECONDS);
  }

  return result;
}
