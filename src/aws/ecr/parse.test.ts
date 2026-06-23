import { describe, expect, it } from "vitest";
import {
  buildNotFoundImageStatus,
  normalizeImageDetail,
  parseEcrImageReference,
  pickImageFromResponse,
} from "./parse.js";
import { makeEcrImageDetail } from "../../test/fixtures.js";

describe("parseEcrImageReference", () => {
  it("parses tag-based image URIs", () => {
    expect(
      parseEcrImageReference(
        "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:v1.2.3",
        "my-app",
      ),
    ).toEqual({
      matchesRepository: true,
      tag: "v1.2.3",
    });
  });

  it("parses digest-based image URIs", () => {
    const digest = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    expect(
      parseEcrImageReference(
        `123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app@${digest}`,
        "my-app",
      ),
    ).toEqual({
      matchesRepository: true,
      digest,
    });
  });
});

describe("normalizeImageDetail", () => {
  it("returns bounded normalized fields", () => {
    const image = makeEcrImageDetail();
    const status = normalizeImageDetail("us-east-1", "my-app", image);

    expect(status).toMatchObject({
      found: true,
      repositoryName: "my-app",
      imageDigest: image.imageDigest,
      tags: ["latest"],
      scanStatus: "COMPLETE",
      scanSummary: { criticalCount: 0, highCount: 1 },
    });
    expect(JSON.stringify(status)).not.toMatch(/arn:aws/);
  });
});

describe("pickImageFromResponse", () => {
  it("selects the most recently pushed image when multiple are returned", () => {
    const older = makeEcrImageDetail({ digest: "sha256:111", pushedAt: 1000 });
    const newer = makeEcrImageDetail({ digest: "sha256:222", pushedAt: 2000 });

    const status = pickImageFromResponse(
      { imageDetails: [older, newer] },
      "us-east-1",
      "my-app",
    );

    expect(status.found).toBe(true);
    expect(status.imageDigest).toBe(newer.imageDigest);
  });

  it("returns not found when no images are present", () => {
    expect(pickImageFromResponse({}, "us-east-1", "my-app")).toEqual(
      buildNotFoundImageStatus("us-east-1", "my-app"),
    );
  });
});
