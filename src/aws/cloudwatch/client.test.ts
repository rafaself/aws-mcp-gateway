import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAlarms } from "./client.js";
import { CloudWatchError } from "./types.js";
import { ValidationError } from "../../security/errors.js";
import { buildCacheKey } from "../../cache/keys.js";
import { cwAlarmsResponse } from "../../test/fixtures.js";
import type { AwsCredentials } from "../types.js";

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

function makeAlarm(opts?: {
  name?: string;
  state?: string;
  reason?: string;
  updatedAt?: string;
  namespace?: string;
  metricName?: string;
}): Record<string, unknown> {
  return {
    AlarmName: opts?.name ?? "HighCPU",
    StateValue: opts?.state ?? "ALARM",
    StateReason: opts?.reason ?? "Threshold Crossed",
    StateUpdatedTimestamp: opts?.updatedAt ?? "2026-06-19T12:00:00.000Z",
    Namespace: opts?.namespace ?? "AWS/EC2",
    MetricName: opts?.metricName ?? "CPUUtilization",
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  awsClientConstructors.length = 0;
});

describe("listAlarms", () => {
  it("returns normalized alarms from a single region", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        cwAlarmsResponse([makeAlarm({ name: "HighCPU" })]),
      ),
    );

    const result = await listAlarms({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "HighCPU",
      region: "us-east-1",
      state: "ALARM",
      reason: "Threshold Crossed",
      updatedAt: "2026-06-19T12:00:00.000Z",
      namespace: "AWS/EC2",
      metricName: "CPUUtilization",
    });
  });

  it("returns alarms from multiple regions", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("us-east-1")) {
        return Promise.resolve(
          cwAlarmsResponse([makeAlarm({ name: "CPU-East" })]),
        );
      }
      if (url.includes("us-west-2")) {
        return Promise.resolve(
          cwAlarmsResponse([makeAlarm({ name: "CPU-West" })]),
        );
      }
      return Promise.resolve(cwAlarmsResponse([]));
    });

    const result = await listAlarms(
      {},
      ["us-east-1", "us-west-2"],
      credentials,
    );

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("CPU-East");
    expect(result[0].region).toBe("us-east-1");
    expect(result[1].name).toBe("CPU-West");
    expect(result[1].region).toBe("us-west-2");
  });

  it("returns empty array when no alarms exist", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    const result = await listAlarms({}, ["us-east-1"], credentials);

    expect(result).toEqual([]);
  });

  it("filters by single state via API parameter", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([makeAlarm()])),
    );

    await listAlarms(
      { stateFilter: ["ALARM"] },
      ["us-east-1"],
      credentials,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const headers = (callArgs[1] as { headers?: Record<string, string> }).headers ?? {};
    expect(headers["X-Amz-Target"]).toBe("GraniteServiceVersion20100801.DescribeAlarms");
    const body = JSON.parse((callArgs[1] as { body?: string }).body ?? "{}");
    expect(body.StateValue).toBe("ALARM");
  });

  it("filters by multiple states via client-side filter", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        cwAlarmsResponse([
          makeAlarm({ name: "Alarm1", state: "ALARM" }),
          makeAlarm({ name: "Alarm2", state: "OK" }),
          makeAlarm({ name: "Alarm3", state: "INSUFFICIENT_DATA" }),
        ]),
      ),
    );

    const result = await listAlarms(
      { stateFilter: ["ALARM", "OK"] },
      ["us-east-1"],
      credentials,
    );

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.name).sort()).toEqual(["Alarm1", "Alarm2"]);
  });

  it("handles pagination across multiple pages", async () => {
    let callCount = 0;

    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          cwAlarmsResponse(
            [makeAlarm({ name: "Page1-Alarm" })],
            "next-token-1",
          ),
        );
      }
      return Promise.resolve(cwAlarmsResponse([makeAlarm({ name: "Page2-Alarm" })]));
    });

    const result = await listAlarms({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Page1-Alarm");
    expect(result[1].name).toBe("Page2-Alarm");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("passes NextToken in subsequent pagination requests", async () => {
    let callCount = 0;

    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          cwAlarmsResponse([makeAlarm()], "token-abc"),
        );
      }
      return Promise.resolve(cwAlarmsResponse([]));
    });

    await listAlarms({}, ["us-east-1"], credentials);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body?: string }).body ?? "{}",
    );
    const secondBody = JSON.parse(
      (mockFetch.mock.calls[1][1] as { body?: string }).body ?? "{}",
    );
    expect(firstBody.NextToken).toBeUndefined();
    expect(secondBody.NextToken).toBe("token-abc");
  });

  it("sends correct X-Amz-Target header on every request", async () => {
    let callCount = 0;

    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          cwAlarmsResponse([makeAlarm({ name: "A" })], "token-next"),
        );
      }
      return Promise.resolve(cwAlarmsResponse([makeAlarm({ name: "B" })]));
    });

    await listAlarms({}, ["us-east-1"], credentials);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) {
      const headers = (mockFetch.mock.calls[i][1] as { headers?: Record<string, string> }).headers ?? {};
      expect(headers["X-Amz-Target"]).toBe("GraniteServiceVersion20100801.DescribeAlarms");
    }
  });

  it("rejects invalid state filter before any AWS call", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    await expect(
      listAlarms(
        { stateFilter: ["INVALID"] as never },
        ["us-east-1"],
        credentials,
      ),
    ).rejects.toThrow(CloudWatchError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects region not in allowlist before any AWS call", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    await expect(
      listAlarms(
        { regions: ["eu-central-1"] },
        ["us-east-1"],
        credentials,
      ),
    ).rejects.toThrow(ValidationError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("queries all allowed regions when no regions specified", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    await listAlarms({}, allowedRegions, credentials);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("queries only requested regions when specified", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    await listAlarms(
      { regions: ["us-east-1", "eu-west-1"] },
      allowedRegions,
      credentials,
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("sorts ALARM state before INSUFFICIENT_DATA before OK", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        cwAlarmsResponse([
          makeAlarm({ name: "B-Alarm", state: "OK" }),
          makeAlarm({ name: "A-Alarm", state: "ALARM" }),
          makeAlarm({ name: "C-Alarm", state: "INSUFFICIENT_DATA" }),
        ]),
      ),
    );

    const result = await listAlarms({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(3);
    expect(result[0].state).toBe("ALARM");
    expect(result[0].name).toBe("A-Alarm");
    expect(result[1].state).toBe("INSUFFICIENT_DATA");
    expect(result[2].state).toBe("OK");
  });

  it("sorts by region then name within same state", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("eu-west-1")) {
        return Promise.resolve(
          cwAlarmsResponse([
            makeAlarm({ name: "Z-CPU", state: "ALARM" }),
          ]),
        );
      }
      return Promise.resolve(
        cwAlarmsResponse([
          makeAlarm({ name: "A-CPU", state: "ALARM" }),
          makeAlarm({ name: "B-CPU", state: "OK" }),
        ]),
      );
    });

    const result = await listAlarms(
      {},
      ["us-east-1", "eu-west-1"],
      credentials,
    );

    expect(result).toHaveLength(3);
    expect(result[0].region).toBe("eu-west-1");
    expect(result[0].name).toBe("Z-CPU");
    expect(result[1].region).toBe("us-east-1");
    expect(result[1].name).toBe("A-CPU");
    expect(result[2].region).toBe("us-east-1");
    expect(result[2].name).toBe("B-CPU");
  });

  it("handles partial region failure gracefully", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("us-east-1")) {
        return Promise.resolve(
          cwAlarmsResponse([makeAlarm({ name: "East-Alarm" })]),
        );
      }
      throw new Error("Network error");
    });

    const result = await listAlarms(
      {},
      ["us-east-1", "us-west-2"],
      credentials,
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("East-Alarm");
    expect(result[0].region).toBe("us-east-1");
  });

  it("throws when all regions fail", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(
      listAlarms({}, ["us-east-1", "us-west-2"], credentials),
    ).rejects.toThrow("AWS request failed.");
  });

  it("passes credentials to AwsClient constructor", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    await listAlarms({}, ["us-east-1"], credentials);

    expect(awsClientConstructors).toHaveLength(1);
    expect(awsClientConstructors[0]).toMatchObject({
      accessKeyId: "AKIA-test-key",
      secretAccessKey: "test-secret",
      service: "monitoring",
      region: "us-east-1",
    });
  });

  it("sets monitoring service and region in AwsClient for each region", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    await listAlarms({}, ["us-east-1", "us-west-2"], credentials);

    expect(awsClientConstructors).toHaveLength(2);
    expect(awsClientConstructors[0].region).toBe("us-east-1");
    expect(awsClientConstructors[1].region).toBe("us-west-2");
    expect(awsClientConstructors[0].service).toBe("monitoring");
    expect(awsClientConstructors[1].service).toBe("monitoring");
  });

  it("does not leak raw response fields in output", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        cwAlarmsResponse([makeAlarm()]),
      ),
    );

    const result = await listAlarms({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(1);
    const keys = Object.keys(result[0]);
    expect(keys).not.toContain("AlarmName");
    expect(keys).not.toContain("StateValue");
    expect(keys).not.toContain("StateReason");
    expect(keys).not.toContain("StateUpdatedTimestamp");
  });

  it("handles missing optional fields in raw response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        cwAlarmsResponse([
          {
            AlarmName: "PartialAlarm",
            StateValue: "ALARM",
          },
        ]),
      ),
    );

    const result = await listAlarms({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "PartialAlarm",
      region: "us-east-1",
      state: "ALARM",
      reason: "",
      updatedAt: "",
      namespace: "",
      metricName: "",
    });
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

describe("listAlarms with cache", () => {
  it("returns cached result without calling AWS on cache hit", async () => {
    const cache = createMockKv();
    const cachedResult = [
      {
        name: "CachedAlarm",
        region: "us-east-1",
        state: "ALARM",
        reason: "Cached reason",
        updatedAt: "2026-06-19T12:00:00.000Z",
        namespace: "AWS/EC2",
        metricName: "CPUUtilization",
      },
    ];
    const key = await buildCacheKey("get_cloudwatch_alarms", {
      regions: ["us-east-1"],
      stateFilter: [],
    });
    cache.store.set(key, JSON.stringify(cachedResult));

    const result = await listAlarms(
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
      Promise.resolve(cwAlarmsResponse([makeAlarm({ name: "FreshAlarm" })])),
    );

    const result = await listAlarms(
      {},
      ["us-east-1"],
      credentials,
      cache as never,
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("FreshAlarm");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalled();
  });

  it("does not cache when AWS call fails", async () => {
    const cache = createMockKv();
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(
      listAlarms({}, ["us-east-1"], credentials, cache as never),
    ).rejects.toThrow();

    expect(cache.put).not.toHaveBeenCalled();
  });

  it("works when cache binding is absent", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([makeAlarm({ name: "NoCache" })])),
    );

    const result = await listAlarms({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
