import { describe, expect, it } from "vitest";
import {
  validateImageDigest,
  validateImageSelector,
  validateImageTag,
  validateRepositoryName,
} from "./validation.js";
import { EcrError } from "./types.js";

describe("ecr validation", () => {
  it("accepts valid repository names", () => {
    expect(() => validateRepositoryName("my-app")).not.toThrow();
  });

  it("rejects empty repository names", () => {
    expect(() => validateRepositoryName("")).toThrow(EcrError);
  });

  it("rejects both imageTag and imageDigest", () => {
    expect(() =>
      validateImageSelector("latest", "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"),
    ).toThrow(EcrError);
  });

  it("validates sha256 digests", () => {
    expect(() =>
      validateImageDigest(
        "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      ),
    ).not.toThrow();
    expect(() => validateImageDigest("sha256:short")).toThrow(EcrError);
  });

  it("validates image tags", () => {
    expect(() => validateImageTag("latest")).not.toThrow();
    expect(() => validateImageTag("")).toThrow(EcrError);
  });
});
