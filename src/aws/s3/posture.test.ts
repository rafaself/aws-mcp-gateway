import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ecrJsonResponse,
  s3BucketLocationXml,
  s3ErrorXml,
  s3XmlResponse,
} from "../../test/fixtures.js";
import { getBucketPosture } from "./posture.js";

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

beforeEach(() => {
  mockFetch.mockReset();
});

describe("getBucketPosture", () => {
  it("returns bucketExists false for missing buckets", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(s3ErrorXml("NoSuchBucket")));

    const posture = await getBucketPosture("missing-bucket", "us-east-1", credentials);

    expect(posture).toEqual({
      bucketName: "missing-bucket",
      region: "us-east-1",
      bucketExists: false,
      tlsOnlyPolicyIndicator: "unknown",
    });
  });

  it("returns normalized posture metadata without object reads", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("location")) {
        return Promise.resolve(s3XmlResponse(s3BucketLocationXml("us-west-2")));
      }
      if (url.includes("publicAccessBlock")) {
        return Promise.resolve(
          s3XmlResponse(
            '<?xml version="1.0"?><PublicAccessBlockConfiguration><BlockPublicAcls>true</BlockPublicAcls><IgnorePublicAcls>true</IgnorePublicAcls><BlockPublicPolicy>true</BlockPublicPolicy><RestrictPublicBuckets>true</RestrictPublicBuckets></PublicAccessBlockConfiguration>',
          ),
        );
      }
      if (url.includes("encryption")) {
        return Promise.resolve(
          s3XmlResponse(
            '<?xml version="1.0"?><ServerSideEncryptionConfiguration><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>AES256</SSEAlgorithm></ApplyServerSideEncryptionByDefault></Rule></ServerSideEncryptionConfiguration>',
          ),
        );
      }
      if (url.includes("versioning")) {
        return Promise.resolve(
          s3XmlResponse(
            '<?xml version="1.0"?><VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>',
          ),
        );
      }
      if (url.includes("policyStatus")) {
        return Promise.resolve(
          s3XmlResponse('<?xml version="1.0"?><PolicyStatus><IsPublic>false</IsPublic></PolicyStatus>'),
        );
      }
      if (url.includes("monitoring.us-west-2.amazonaws.com")) {
        return Promise.resolve(
          ecrJsonResponse({
            MetricDataResults: [
              {
                Id: "BucketSizeBytes",
                Timestamps: [1718798400],
                Values: [1024],
              },
            ],
          }),
        );
      }
      return Promise.resolve(s3ErrorXml("NoSuchLifecycleConfiguration"));
    });

    const posture = await getBucketPosture("my-bucket", "us-east-1", credentials);

    expect(posture.bucketExists).toBe(true);
    expect(posture.region).toBe("us-west-2");
    expect(posture.publicAccessBlock).toMatchObject({
      blockPublicAcls: true,
      restrictPublicBuckets: true,
    });
    expect(posture.encryption).toMatchObject({ configured: true, algorithm: "AES256" });
    expect(posture.versioning).toEqual({ status: "Enabled" });
    expect(posture.isPublic).toBe(false);
    expect(posture.tlsOnlyPolicyIndicator).toBe("unknown");
    expect(JSON.stringify(posture)).not.toMatch(/<Contents>/);
  });
});
