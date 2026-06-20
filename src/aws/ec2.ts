import { AwsClient } from "aws4fetch";
import { AwsRequestError } from "./errors.js";
import { resolveRegions } from "../security/regions.js";
import type { AwsCredentials } from "./types.js";
import {
  Ec2Error,
  VALID_INSTANCE_STATES,
  type Ec2ListInstancesOptions,
  type Ec2Instance,
  type Ec2DescribeInstancesResponse,
  type Ec2RawInstance,
} from "./ec2-types.js";

const EC2_API_VERSION = "2016-11-15";
const EC2_REQUEST_TIMEOUT_MS = 30_000;

function validateStateFilter(state: string): void {
  if (!(VALID_INSTANCE_STATES as readonly string[]).includes(state)) {
    throw new Ec2Error(
      "invalid_state_filter",
      `Invalid EC2 instance state "${state}". Valid states: ${VALID_INSTANCE_STATES.join(", ")}`,
    );
  }
}

async function ec2Fetch<T>(
  action: string,
  params: Record<string, string>,
  region: string,
  credentials: AwsCredentials,
): Promise<T> {
  const client = new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: "ec2",
    region,
  });

  const url = new URL(`https://ec2.${region}.amazonaws.com/`);

  const bodyParams = new URLSearchParams({
    Action: action,
    Version: EC2_API_VERSION,
    ...params,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EC2_REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: bodyParams.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: `EC2 request failed in ${region}.`,
        retryable: response.status >= 500,
        statusCode: response.status,
        service: "ec2",
        region,
      });
    }

    const text = await response.text();

    if (text.length === 0) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof AwsRequestError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: `EC2 request timed out in ${region}.`,
        retryable: true,
        statusCode: 0,
        service: "ec2",
        region,
      });
    }

    throw new AwsRequestError({
      code: "aws_request_failed",
      message: `EC2 request failed in ${region}.`,
      retryable: false,
      statusCode: 0,
      service: "ec2",
      region,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseInstance(raw: Ec2RawInstance, region: string): Ec2Instance {
  const tags = raw.tagSet?.item ?? [];
  const nameTag = tags.find((t) => t.key === "Name");
  const instance: Ec2Instance = {
    instanceId: raw.instanceId ?? "unknown",
    region,
    state: raw.instanceState?.name ?? "unknown",
    instanceType: raw.instanceType ?? "unknown",
    name: nameTag?.value ?? "",
    launchTime: raw.launchTime ?? "",
    availabilityZone: raw.placement?.availabilityZone ?? "",
  };

  if (raw.ipAddress) {
    instance.publicIpAddress = raw.ipAddress;
  }

  if (raw.privateIpAddress) {
    instance.privateIpAddress = raw.privateIpAddress;
  }

  return instance;
}

function buildDescribeInstancesParams(
  stateFilter: string | undefined,
): Record<string, string> {
  const params: Record<string, string> = {};

  if (stateFilter) {
    params["Filter.1.Name"] = "instance-state-name";
    params["Filter.1.Value.1"] = stateFilter;
  }

  return params;
}

export async function listInstances(
  options: Ec2ListInstancesOptions,
  allowedRegions: string[],
  credentials: AwsCredentials,
): Promise<Ec2Instance[]> {
  if (options.stateFilter) {
    validateStateFilter(options.stateFilter);
  }

  const regions = resolveRegions(options.regions, allowedRegions);

  const params = buildDescribeInstancesParams(options.stateFilter);

  const outcomes = await Promise.allSettled(
    regions.map((region) =>
      ec2Fetch<Ec2DescribeInstancesResponse>("DescribeInstances", params, region, credentials)
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

  return allInstances;
}
