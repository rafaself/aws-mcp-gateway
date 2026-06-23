import { describe, expect, it } from "vitest";
import {
  maskArn,
  maskEmailAddress,
  maskSubscriptionEndpoint,
  summarizeTopicPolicy,
} from "./masking.js";

describe("maskEmailAddress", () => {
  it("masks local part of email", () => {
    expect(maskEmailAddress("john.doe@example.com")).toBe("j***@example.com");
  });

  it("handles single-character local part", () => {
    expect(maskEmailAddress("a@example.com")).toBe("*@example.com");
  });
});

describe("maskSubscriptionEndpoint", () => {
  it("masks email endpoints", () => {
    expect(maskSubscriptionEndpoint("ops@company.com", "email")).toBe("o***@company.com");
  });

  it("masks phone endpoints", () => {
    expect(maskSubscriptionEndpoint("+15551234567", "sms")).toMatch(/\*+4567$/);
  });

  it("masks ARNs in endpoints", () => {
    const arn = "arn:aws:sqs:us-east-1:123456789012:my-queue";
    expect(maskSubscriptionEndpoint(arn, "sqs")).toBe("[REDACTED_ARN]");
  });
});

describe("maskArn", () => {
  it("replaces ARNs with placeholder", () => {
    expect(maskArn("arn:aws:sns:us-east-1:123456789012:ops")).toBe("[REDACTED_ARN]");
  });
});

describe("summarizeTopicPolicy", () => {
  it("summarizes policy without exposing principals", () => {
    const policy = JSON.stringify({
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::123456789012:root" },
          Action: "sns:Publish",
        },
        {
          Effect: "Allow",
          Principal: "*",
          Action: "sns:Subscribe",
        },
      ],
    });
    expect(summarizeTopicPolicy(policy)).toEqual({
      statementCount: 2,
      allowsPublish: true,
      principalTypes: ["aws", "wildcard"],
    });
  });

  it("returns undefined for invalid JSON", () => {
    expect(summarizeTopicPolicy("not-json")).toBeUndefined();
  });
});
