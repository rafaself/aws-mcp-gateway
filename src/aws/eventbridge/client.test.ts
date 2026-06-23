import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRulesStatus } from "./client.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const credentials = {
  accessKeyId: "AKIATEST",
  secretAccessKey: "secret",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("getRulesStatus", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns normalized rules and schedules without raw target input", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          Rules: [{ Name: "daily-sync", State: "ENABLED", ScheduleExpression: "rate(1 day)" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          Name: "daily-sync",
          State: "ENABLED",
          ScheduleExpression: "rate(1 day)",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          Targets: [
            {
              Id: "target-1",
              Arn: "arn:aws:lambda:us-east-1:123456789012:function:sync",
              RoleArn: "arn:aws:iam::123456789012:role/events",
              Input: '{"secret":"value"}',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          Schedules: [{ Name: "nightly-job", State: "ENABLED" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          Name: "nightly-job",
          State: "ENABLED",
          ScheduleExpression: "cron(0 2 * * ? *)",
          Target: {
            Arn: "arn:aws:lambda:us-east-1:123456789012:function:nightly",
            RoleArn: "arn:aws:iam::123456789012:role/scheduler",
            Input: '{"token":"secret"}',
          },
        }),
      );

    const result = await getRulesStatus({ region: "us-east-1" }, credentials);

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].targets[0].arn).toBe("[REDACTED_ARN]");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result.schedules).toHaveLength(1);
    expect(result.schedules[0].targetArn).toBe("[REDACTED_ARN]");
  });
});
