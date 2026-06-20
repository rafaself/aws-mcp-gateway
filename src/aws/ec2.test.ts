import { describe, it, expect, vi, beforeEach } from "vitest";
import { listInstances } from "./ec2.js";
import { Ec2Error } from "./ec2-types.js";
import { ValidationError } from "../security/errors.js";
import { buildCacheKey } from "../cache/keys.js";
import {
  ec2XmlResponse,
  describeInstancesXml,
  instanceXml,
} from "../test/fixtures.js";
import type { AwsCredentials } from "./types.js";

const { mockFetch, awsClientConstructors } = vi.hoisted(() => {
  const mockFetch = vi.fn();
  const awsClientConstructors: Array<Record<string, unknown>> = [];
  return { mockFetch, awsClientConstructors };
});

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    accessKeyId: string;
    secretAccessKey: string;
    service: string | undefined;
    region: string | undefined;
    fetch = mockFetch;

    constructor(opts: {
      accessKeyId: string;
      secretAccessKey: string;
      service?: string;
      region?: string;
    }) {
      awsClientConstructors.push(opts);
      this.accessKeyId = opts.accessKeyId;
      this.secretAccessKey = opts.secretAccessKey;
      this.service = opts.service;
      this.region = opts.region;
    }
  },
}));

const credentials: AwsCredentials = {
  accessKeyId: "AKIA-test-key",
  secretAccessKey: "test-secret",
};

const allowedRegions = ["us-east-1", "us-west-2", "eu-west-1"];

beforeEach(() => {
  mockFetch.mockReset();
  awsClientConstructors.length = 0;
});

describe("listInstances", () => {
  it("returns normalized instances from a single region", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({ instanceId: "i-11111111" }),
          ]),
        ),
      ),
    );

    const result = await listInstances(
      {},
      ["us-east-1"],
      credentials,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      instanceId: "i-11111111",
      region: "us-east-1",
      state: "running",
      instanceType: "t3.micro",
      name: "test-instance",
      launchTime: "2026-06-01T12:00:00.000Z",
      availabilityZone: "us-east-1a",
      publicIpAddress: "203.0.113.10",
      privateIpAddress: "10.0.0.10",
    });
  });

  it("returns instances from multiple regions", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("us-east-1")) {
        return Promise.resolve(
          ec2XmlResponse(
            describeInstancesXml([
              instanceXml({
                instanceId: "i-11111111",
                availabilityZone: "us-east-1a",
              }),
            ]),
          ),
        );
      }
      if (url.includes("us-west-2")) {
        return Promise.resolve(
          ec2XmlResponse(
            describeInstancesXml([
              instanceXml({
                instanceId: "i-22222222",
                availabilityZone: "us-west-2b",
              }),
            ]),
          ),
        );
      }
      return Promise.resolve(ec2XmlResponse(describeInstancesXml([])));
    });

    const result = await listInstances(
      {},
      ["us-east-1", "us-west-2"],
      credentials,
    );

    expect(result).toHaveLength(2);
    expect(result[0].region).toBe("us-east-1");
    expect(result[0].instanceId).toBe("i-11111111");
    expect(result[1].region).toBe("us-west-2");
    expect(result[1].instanceId).toBe("i-22222222");
  });

  it("returns empty array when no instances exist", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    const result = await listInstances(
      {},
      ["us-east-1"],
      credentials,
    );

    expect(result).toEqual([]);
  });

  it("returns empty array when region has no reservations", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          `<?xml version="1.0" encoding="UTF-8"?>
<DescribeInstancesResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">
  <requestId>abc-123</requestId>
</DescribeInstancesResponse>`,
        ),
      ),
    );

    const result = await listInstances(
      {},
      ["us-east-1"],
      credentials,
    );

    expect(result).toEqual([]);
  });

  it("passes single state filter as query parameter", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    await listInstances(
      { stateFilter: ["running"] },
      ["us-east-1"],
      credentials,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const body = (callArgs[1] as { body?: string }).body ?? "";
    expect(body).toContain("Filter.1.Name=instance-state-name");
    expect(body).toContain("Filter.1.Value.1=running");
  });

  it("passes multiple state filters as query parameters", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    await listInstances(
      { stateFilter: ["running", "stopped"] },
      ["us-east-1"],
      credentials,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const body = (callArgs[1] as { body?: string }).body ?? "";
    expect(body).toContain("Filter.1.Name=instance-state-name");
    expect(body).toContain("Filter.1.Value.1=running");
    expect(body).toContain("Filter.1.Value.2=stopped");
  });

  it("accepts shutting-down as valid state", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    await listInstances(
      { stateFilter: ["shutting-down"] },
      ["us-east-1"],
      credentials,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid state filter before any AWS call", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    await expect(
      listInstances(
        { stateFilter: ["INVALID"] as never },
        ["us-east-1"],
        credentials,
      ),
    ).rejects.toThrow(Ec2Error);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects region not in allowlist before any AWS call", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    await expect(
      listInstances(
        { regions: ["eu-central-1"] },
        ["us-east-1"],
        credentials,
      ),
    ).rejects.toThrow(ValidationError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("queries all allowed regions when no regions specified", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    await listInstances({}, allowedRegions, credentials);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("queries only requested regions when specified", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    await listInstances(
      { regions: ["us-east-1", "eu-west-1"] },
      allowedRegions,
      credentials,
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("extracts Name tag from instance", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({
              tags: [
                { key: "Name", value: "web-server-01" },
                { key: "Environment", value: "production" },
              ],
            }),
          ]),
        ),
      ),
    );

    const result = await listInstances({}, ["us-east-1"], credentials);

    expect(result[0].name).toBe("web-server-01");
  });

  it("returns empty name when no Name tag exists", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({
              tags: [{ key: "Environment", value: "production" }],
            }),
          ]),
        ),
      ),
    );

    const result = await listInstances({}, ["us-east-1"], credentials);

    expect(result[0].name).toBe("");
  });

  it("omits publicIpAddress when not returned by AWS", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({
              ipAddress: undefined,
              privateIpAddress: "10.0.0.10",
            }),
          ]),
        ),
      ),
    );

    const result = await listInstances({}, ["us-east-1"], credentials);

    expect(result[0].publicIpAddress).toBeUndefined();
    expect(result[0].privateIpAddress).toBe("10.0.0.10");
  });

  it("omits privateIpAddress when not returned by AWS", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({
              ipAddress: "203.0.113.10",
              privateIpAddress: undefined,
            }),
          ]),
        ),
      ),
    );

    const result = await listInstances({}, ["us-east-1"], credentials);

    expect(result[0].publicIpAddress).toBe("203.0.113.10");
    expect(result[0].privateIpAddress).toBeUndefined();
  });

  it("returns instances sorted by region then instanceId", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("eu-west-1")) {
        return Promise.resolve(
          ec2XmlResponse(
            describeInstancesXml([
              instanceXml({ instanceId: "i-bbbbbbbb" }),
              instanceXml({ instanceId: "i-aaaaaaaa" }),
            ]),
          ),
        );
      }
      return Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({ instanceId: "i-cccccccc" }),
          ]),
        ),
      );
    });

    const result = await listInstances(
      {},
      ["us-east-1", "eu-west-1"],
      credentials,
    );

    expect(result.map((i) => `${i.region}:${i.instanceId}`)).toEqual([
      "eu-west-1:i-aaaaaaaa",
      "eu-west-1:i-bbbbbbbb",
      "us-east-1:i-cccccccc",
    ]);
  });

  it("handles partial region failure gracefully", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("us-east-1")) {
        return Promise.resolve(
          ec2XmlResponse(
            describeInstancesXml([
              instanceXml({ instanceId: "i-11111111" }),
            ]),
          ),
        );
      }
      throw new Error("Network error");
    });

    const result = await listInstances(
      {},
      ["us-east-1", "us-west-2"],
      credentials,
    );

    expect(result).toHaveLength(1);
    expect(result[0].instanceId).toBe("i-11111111");
    expect(result[0].region).toBe("us-east-1");
  });

  it("throws when all regions fail", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(
      listInstances({}, ["us-east-1", "us-west-2"], credentials),
    ).rejects.toThrow("EC2 request failed in us-east-1.");
  });

  it("passes credentials to AwsClient constructor", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    await listInstances({}, ["us-east-1"], credentials);

    expect(awsClientConstructors).toHaveLength(1);
    expect(awsClientConstructors[0]).toMatchObject({
      accessKeyId: "AKIA-test-key",
      secretAccessKey: "test-secret",
      service: "ec2",
      region: "us-east-1",
    });
  });

  it("sets ec2 service and region in AwsClient for each region", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ec2XmlResponse(describeInstancesXml([]))),
    );

    await listInstances({}, ["us-east-1", "us-west-2"], credentials);

    expect(awsClientConstructors).toHaveLength(2);
    expect(awsClientConstructors[0].region).toBe("us-east-1");
    expect(awsClientConstructors[1].region).toBe("us-west-2");
  });

  it("does not leak raw response fields in output", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml(),
          ]),
        ),
      ),
    );

    const result = await listInstances({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(1);
    const keys = Object.keys(result[0]);
    expect(keys).not.toContain("reservationId");
    expect(keys).not.toContain("ownerId");
    expect(keys).not.toContain("tagSet");
  });

  it("handles instances without tagSet", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({ noTagSet: true }),
          ]),
        ),
      ),
    );

    const result = await listInstances({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("");
  });

  it("handles instances without placement", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({ noPlacement: true }),
          ]),
        ),
      ),
    );

    const result = await listInstances({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(1);
    expect(result[0].availabilityZone).toBe("");
  });
});

function createMockKv(): { store: Map<string, string>; get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> } {
  const store = new Map<string, string>();

  const get = vi.fn(async (key: string, _type?: string) => {
    const raw = store.get(key);
    if (raw === undefined) return null;
    return JSON.parse(raw);
  });

  const put = vi.fn(
    async (key: string, value: string, _options?: { expirationTtl?: number }) => {
      store.set(key, value);
    },
  );

  return { store, get, put };
}

describe("listInstances with cache", () => {
  it("returns cached result without calling AWS on cache hit", async () => {
    const cache = createMockKv();
    const cachedResult = [
      {
        instanceId: "i-cached",
        region: "us-east-1",
        state: "running",
        instanceType: "t3.micro",
        name: "cached-instance",
        launchTime: "2026-06-01T12:00:00.000Z",
        availabilityZone: "us-east-1a",
      },
    ];
    const key = await buildCacheKey("list_ec2_instances", {
      regions: ["us-east-1"],
      stateFilter: [],
    });
    cache.store.set(key, JSON.stringify(cachedResult));

    const result = await listInstances(
      {},
      ["us-east-1"],
      credentials,
      cache as never,
    );

    expect(result).toEqual(cachedResult);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls AWS and stores result on cache miss", async () => {
    const cache = createMockKv();
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({ instanceId: "i-11111111" }),
          ]),
        ),
      ),
    );

    const result = await listInstances(
      {},
      ["us-east-1"],
      credentials,
      cache as never,
    );

    expect(result).toHaveLength(1);
    expect(result[0].instanceId).toBe("i-11111111");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalled();
  });

  it("does not cache when AWS call fails", async () => {
    const cache = createMockKv();
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(
      listInstances({}, ["us-east-1"], credentials, cache as never),
    ).rejects.toThrow();

    expect(cache.put).not.toHaveBeenCalled();
  });

  it("works when cache binding is absent", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ec2XmlResponse(
          describeInstancesXml([
            instanceXml({ instanceId: "i-11111111" }),
          ]),
        ),
      ),
    );

    const result = await listInstances({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
