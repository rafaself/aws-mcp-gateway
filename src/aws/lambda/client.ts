import { resolveRegions } from "../../security/regions.js";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheGet, cacheSet } from "../../cache/kv.js";
import { LAMBDA_CACHE_TTL_SECONDS, LAMBDA_MAX_FUNCTIONS } from "../../security/limits.js";
import { awsRequest } from "../client.js";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import type {
  LambdaFunction,
  LambdaListFunctionsOptions,
  ListFunctionsResponse,
} from "./types.js";

function parseFunction(
  raw: NonNullable<ListFunctionsResponse["Functions"]>[number],
  region: string,
): LambdaFunction {
  return {
    functionName: raw.FunctionName ?? "",
    region,
    runtime: raw.Runtime ?? "unknown",
    state: raw.State ?? "unknown",
  };
}

export async function listFunctions(
  options: LambdaListFunctionsOptions,
  allowedRegions: string[],
  credentials: AwsCredentials,
  cache?: KVNamespace,
): Promise<LambdaFunction[]> {
  const limit = options.limit ?? LAMBDA_MAX_FUNCTIONS;
  const regions = resolveRegions(options.regions, allowedRegions);
  const sortedRegions = [...regions].sort();

  if (cache) {
    const cacheKey = await buildCacheKey("list_lambda_functions", {
      regions: sortedRegions,
      limit,
    });
    const cached = await cacheGet<LambdaFunction[]>(cache, cacheKey);
    if (cached) return cached;
  }

  const outcomes = await Promise.allSettled(
    regions.map((region) =>
      awsRequest<ListFunctionsResponse>(
        {
          capability: "lambda:ListFunctions",
          service: "lambda",
          region,
          method: "POST",
          path: "/",
          headers: {
            "X-Amz-Target": "Lambda_20150331.ListFunctions",
            "Content-Type": "application/x-amz-json-1.0",
          },
          body: { MaxItems: LAMBDA_MAX_FUNCTIONS },
        },
        credentials,
      ).then((response) => {
        const rawFunctions = response.Functions ?? [];
        return rawFunctions.map((fn) => parseFunction(fn, region));
      }),
    ),
  );

  const allFunctions: LambdaFunction[] = [];
  const errors: Array<{ region: string; reason: unknown }> = [];

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    if (outcome.status === "fulfilled") {
      allFunctions.push(...outcome.value);
    } else {
      errors.push({ region: regions[i], reason: outcome.reason });
    }
  }

  if (allFunctions.length === 0 && errors.length > 0) {
    const firstError = errors[0].reason;
    if (firstError instanceof AwsRequestError) {
      throw firstError;
    }
    throw new AwsRequestError({
      code: "aws_request_failed",
      message: "Lambda request failed in all regions.",
      retryable: false,
      statusCode: 0,
      service: "lambda",
    });
  }

  allFunctions.sort((a, b) => {
    const regionCmp = a.region.localeCompare(b.region);
    if (regionCmp !== 0) return regionCmp;
    return a.functionName.localeCompare(b.functionName);
  });

  const result = allFunctions.slice(0, limit);

  if (cache) {
    const cacheKey = await buildCacheKey("list_lambda_functions", {
      regions: sortedRegions,
      limit,
    });
    await cacheSet(cache, cacheKey, result, LAMBDA_CACHE_TTL_SECONDS);
  }

  return result;
}
