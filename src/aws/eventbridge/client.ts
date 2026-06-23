import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { EVENTBRIDGE_CACHE_TTL_SECONDS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import {
  buildRulesStatusResult,
  normalizeRule,
  normalizeSchedule,
  normalizeTargets,
} from "./parse.js";
import {
  describeRule,
  getSchedule,
  listRules,
  listSchedules,
  listTargetsByRule,
} from "./requests.js";
import type { EventBridgeRulesStatusResult } from "./types.js";
import {
  validateLimit,
  validateRuleNamePrefix,
  validateScheduleNamePrefix,
} from "./validation.js";

export async function getRulesStatus(
  options: {
    region: string;
    ruleNamePrefix?: string;
    scheduleNamePrefix?: string;
    limit?: number;
  },
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
  cacheOptions?: { roleArn?: string },
): Promise<EventBridgeRulesStatusResult> {
  const region = options.region;
  const ruleNamePrefix = validateRuleNamePrefix(options.ruleNamePrefix);
  const scheduleNamePrefix = validateScheduleNamePrefix(options.scheduleNamePrefix);
  const limit = validateLimit(options.limit);

  const cacheKey = await buildCacheKey("get_eventbridge_rules_status", {
    region,
    ruleNamePrefix,
    scheduleNamePrefix,
    limit,
    ...(cacheOptions?.roleArn ? { roleArn: cacheOptions.roleArn } : {}),
  });
  const { value: cached } = await cacheReadWithStatus<EventBridgeRulesStatusResult>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) {
    return cached;
  }

  const rulesResponse = await listRules(region, credentials, execution, {
    namePrefix: ruleNamePrefix,
    limit,
  });
  const ruleNames = (rulesResponse.Rules ?? [])
    .map((rule) => rule.Name)
    .filter((name): name is string => Boolean(name))
    .slice(0, limit);

  const rules = await Promise.all(
    ruleNames.map(async (name) => {
      const [ruleDetail, targetsResponse] = await Promise.all([
        describeRule(name, region, credentials, execution),
        listTargetsByRule(name, region, credentials, execution),
      ]);
      return normalizeRule(ruleDetail, normalizeTargets(targetsResponse));
    }),
  );

  const schedulesResponse = await listSchedules(region, credentials, execution, {
    namePrefix: scheduleNamePrefix,
    maxResults: limit,
  });
  const scheduleNames = (schedulesResponse.Schedules ?? [])
    .map((schedule) => schedule.Name)
    .filter((name): name is string => Boolean(name))
    .slice(0, limit);

  const schedules = await Promise.all(
    scheduleNames.map(async (name) => {
      const schedule = await getSchedule(name, region, credentials, execution);
      return normalizeSchedule(schedule);
    }),
  );

  const truncated =
    (rulesResponse.Rules?.length ?? 0) > limit ||
    (schedulesResponse.Schedules?.length ?? 0) > limit;

  const result = buildRulesStatusResult(region, rules, schedules, truncated);
  if (cache) {
    await cacheSet(cache, cacheKey, result, EVENTBRIDGE_CACHE_TTL_SECONDS);
  }
  return result;
}
