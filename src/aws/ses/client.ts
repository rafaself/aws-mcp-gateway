import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { SES_CACHE_TTL_SECONDS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import {
  buildNotFoundConfigurationStatus,
  normalizeConfigurationStatus,
} from "./parse.js";
import {
  getConfigurationSet,
  getConfigurationSetEventDestinations,
  isConfigurationSetNotFoundError,
} from "./requests.js";
import type { SesConfigurationStatusResult } from "./types.js";
import { validateConfigurationSetName } from "./validation.js";

export async function getConfigurationStatus(
  configurationSetName: string,
  region: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
  cacheOptions?: { roleArn?: string },
): Promise<SesConfigurationStatusResult> {
  const name = validateConfigurationSetName(configurationSetName);

  const cacheKey = await buildCacheKey("get_ses_configuration_status", {
    configurationSetName: name,
    region,
    ...(cacheOptions?.roleArn ? { roleArn: cacheOptions.roleArn } : {}),
  });
  const { value: cached } = await cacheReadWithStatus<SesConfigurationStatusResult>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) {
    return cached;
  }

  try {
    const configSet = await getConfigurationSet(name, region, credentials, execution);
    const eventDestinations = await getConfigurationSetEventDestinations(
      name,
      region,
      credentials,
      execution,
    );

    const result = normalizeConfigurationStatus(region, name, configSet, eventDestinations);
    if (cache) {
      await cacheSet(cache, cacheKey, result, SES_CACHE_TTL_SECONDS);
    }
    return result;
  } catch (err) {
    if (isConfigurationSetNotFoundError(err)) {
      const result = buildNotFoundConfigurationStatus(region, name);
      if (cache) {
        await cacheSet(cache, cacheKey, result, SES_CACHE_TTL_SECONDS);
      }
      return result;
    }
    throw err;
  }
}
