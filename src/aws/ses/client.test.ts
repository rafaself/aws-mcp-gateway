import { beforeEach, describe, expect, it, vi } from "vitest";
import { getConfigurationStatus } from "./client.js";

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

const configSetResponse = {
  ConfigurationSetName: "prod-mail",
  SendingOptions: { SendingEnabled: true },
  ReputationOptions: { ReputationMetricsEnabled: true },
  DeliveryOptions: { TlsPolicy: "REQUIRE" },
};

const eventDestinationsResponse = {
  EventDestinations: [
    {
      Name: "bounce-events",
      Enabled: true,
      MatchingEventTypes: ["BOUNCE", "COMPLAINT"],
      SnsDestination: {
        TopicArn: "arn:aws:sns:us-east-1:123456789012:ses-events",
      },
    },
  ],
};

describe("getConfigurationStatus", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns normalized configuration status", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(configSetResponse), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(eventDestinationsResponse), { status: 200 }),
      );

    const result = await getConfigurationStatus("prod-mail", "us-east-1", credentials);

    expect(result.configurationSetExists).toBe(true);
    expect(result.sendingEnabled).toBe(true);
    expect(result.reputationMetricsEnabled).toBe(true);
    expect(result.tlsPolicy).toBe("REQUIRE");
    expect(result.eventDestinations[0].snsTopicArn).toBe("[REDACTED_ARN]");
  });

  it("returns not found for missing configuration set", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "NotFoundException" }), { status: 404 }),
    );

    const result = await getConfigurationStatus("missing", "us-east-1", credentials);

    expect(result.configurationSetExists).toBe(false);
    expect(result.eventDestinations).toEqual([]);
  });

  it("rejects invalid configuration set name before AWS call", async () => {
    await expect(
      getConfigurationStatus("", "us-east-1", credentials),
    ).rejects.toThrow(/configurationSetName/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
