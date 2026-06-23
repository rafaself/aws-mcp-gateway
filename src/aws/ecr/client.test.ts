import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ecrErrorResponse,
  ecrJsonResponse,
  makeEcrImageDetail,
} from "../../test/fixtures.js";
import { getImageStatus } from "./client.js";

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

const region = "us-east-1";

function targetFromRequest(init: RequestInit): string {
  const headers = init.headers as Record<string, string>;
  return headers["X-Amz-Target"] ?? headers["x-amz-target"] ?? "";
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("getImageStatus", () => {
  it("returns normalized image status for a tagged image", async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const target = targetFromRequest(init);
      if (target.endsWith("DescribeImages")) {
        return Promise.resolve(
          ecrJsonResponse({ imageDetails: [makeEcrImageDetail()] }),
        );
      }
      if (target.endsWith("DescribeImageScanFindings")) {
        return Promise.resolve(
          ecrJsonResponse({
            imageScanFindings: { findingSeverityCounts: { CRITICAL: 0, HIGH: 2 } },
          }),
        );
      }
      if (target.endsWith("GetLifecyclePolicy")) {
        return Promise.resolve(
          ecrJsonResponse({ lifecyclePolicyText: '{"rules":[]}' }),
        );
      }
      return Promise.reject(new Error(`unexpected target: ${target}`));
    });

    const status = await getImageStatus(
      "my-app",
      { region, imageTag: "latest" },
      credentials,
    );

    expect(status).toMatchObject({
      found: true,
      repositoryName: "my-app",
      hasLifecyclePolicy: true,
      scanSummary: { criticalCount: 0, highCount: 2 },
    });
    expect(JSON.stringify(status)).not.toMatch(/arn:aws/);
  });

  it("returns found false for missing repositories", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ecrErrorResponse("RepositoryNotFoundException")),
    );

    const status = await getImageStatus("missing", { region }, credentials);

    expect(status).toEqual({
      region,
      repositoryName: "missing",
      found: false,
    });
  });

  it("rejects both imageTag and imageDigest before AWS calls", async () => {
    await expect(
      getImageStatus(
        "my-app",
        {
          region,
          imageTag: "latest",
          imageDigest:
            "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        },
        credentials,
      ),
    ).rejects.toMatchObject({ code: "validation_error" });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
