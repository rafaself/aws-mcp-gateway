import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTopicStatus } from "./client.js";

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

const topicArn = "arn:aws:sns:us-east-1:123456789012:ops-alerts";

const attributesXml = `<?xml version="1.0"?>
<GetTopicAttributesResponse>
  <GetTopicAttributesResult>
    <Attributes>
      <entry><key>Policy</key><value>{"Statement":[{"Effect":"Allow","Principal":"*","Action":"sns:Subscribe"}]}</value></entry>
      <entry><key>SubscriptionsConfirmed</key><value>1</value></entry>
    </Attributes>
  </GetTopicAttributesResult>
</GetTopicAttributesResponse>`;

const subscriptionsXml = `<?xml version="1.0"?>
<ListSubscriptionsByTopicResponse>
  <ListSubscriptionsByTopicResult>
    <Subscriptions>
      <member>
        <Protocol>email</Protocol>
        <Endpoint>ops@company.com</Endpoint>
        <SubscriptionArn>arn:aws:sns:us-east-1:123456789012:ops-alerts:sub-id</SubscriptionArn>
        <PendingConfirmation>false</PendingConfirmation>
      </member>
    </Subscriptions>
  </ListSubscriptionsByTopicResult>
</ListSubscriptionsByTopicResponse>`;

describe("getTopicStatus", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns normalized topic status with masked endpoints", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(attributesXml, { status: 200 }))
      .mockResolvedValueOnce(new Response(subscriptionsXml, { status: 200 }));

    const result = await getTopicStatus(
      { topicArn, region: "us-east-1" },
      credentials,
    );

    expect(result.topicExists).toBe(true);
    expect(result.subscriptionCount).toBe(1);
    expect(result.protocols).toEqual(["email"]);
    expect(result.subscriptions[0].endpointMasked).toBe("o***@company.com");
    expect(result.policySummary?.statementCount).toBe(1);
  });

  it("returns not found when topic name cannot be resolved", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        `<?xml version="1.0"?><ListTopicsResponse><ListTopicsResult></ListTopicsResult></ListTopicsResponse>`,
        { status: 200 },
      ),
    );

    const result = await getTopicStatus(
      { topicName: "missing-topic", region: "us-east-1" },
      credentials,
    );

    expect(result.topicExists).toBe(false);
    expect(result.subscriptionCount).toBe(0);
  });

  it("requires topicName or topicArn", async () => {
    await expect(
      getTopicStatus({ region: "us-east-1" }, credentials),
    ).rejects.toThrow(/topicName or topicArn/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
