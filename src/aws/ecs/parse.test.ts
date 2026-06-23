import { describe, expect, it } from "vitest";
import {
  extractArnSuffix,
  normalizeTaskDefinitionMetadata,
  normalizeTaskDefinitionRef,
  normalizeTaskSummary,
} from "./parse.js";
import type { DescribeTaskDefinitionResponse } from "./types.js";

describe("extractArnSuffix", () => {
  it("extracts task id from task ARN", () => {
    expect(
      extractArnSuffix("arn:aws:ecs:us-east-1:123456789012:task/my-cluster/abc123"),
    ).toBe("abc123");
  });

  it("extracts family:revision from task definition ARN", () => {
    expect(
      extractArnSuffix(
        "arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:42",
      ),
    ).toBe("my-app:42");
  });
});

describe("normalizeTaskDefinitionRef", () => {
  it("returns family:revision for ARN input", () => {
    expect(
      normalizeTaskDefinitionRef(
        "arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:42",
      ),
    ).toBe("my-app:42");
  });

  it("passes through family:revision input", () => {
    expect(normalizeTaskDefinitionRef("my-app:42")).toBe("my-app:42");
  });
});

describe("normalizeTaskSummary", () => {
  it("normalizes task without full ARNs", () => {
    const summary = normalizeTaskSummary({
      taskArn: "arn:aws:ecs:us-east-1:123456789012:task/my-cluster/abc123",
      taskDefinitionArn:
        "arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:42",
      lastStatus: "RUNNING",
      desiredStatus: "RUNNING",
      healthStatus: "HEALTHY",
      startedAt: "2026-06-01T10:00:00.000Z",
      availabilityZone: "us-east-1a",
      containers: [{ name: "app", lastStatus: "RUNNING" }],
    });

    expect(summary).toEqual({
      taskId: "abc123",
      taskDefinition: "my-app:42",
      lastStatus: "RUNNING",
      desiredStatus: "RUNNING",
      healthStatus: "HEALTHY",
      startedAt: "2026-06-01T10:00:00.000Z",
      availabilityZone: "us-east-1a",
      containers: [{ name: "app", lastStatus: "RUNNING" }],
    });
  });
});

describe("normalizeTaskDefinitionMetadata", () => {
  it("omits environment and secrets from task definition output", () => {
    const response: DescribeTaskDefinitionResponse = {
      taskDefinition: {
        family: "my-app",
        revision: 42,
        cpu: "256",
        memory: "512",
        containerDefinitions: [
          {
            name: "app",
            image: "nginx:latest",
            cpu: 256,
            memory: 512,
            environment: [{ name: "SECRET_KEY", value: "super-secret" }],
            secrets: [{ name: "DB_PASSWORD", valueFrom: "arn:aws:secretsmanager:..." }],
            secretOptions: [{ name: "TOKEN", valueFrom: "arn:aws:ssm:..." }],
          },
        ],
      },
    };

    const normalized = normalizeTaskDefinitionMetadata(response);
    const serialized = JSON.stringify(normalized);

    expect(normalized).toEqual({
      family: "my-app",
      revision: 42,
      cpu: "256",
      memory: "512",
      containers: [
        {
          name: "app",
          image: "nginx:latest",
          cpu: 256,
          memory: 512,
        },
      ],
    });
    expect(serialized).not.toContain("SECRET_KEY");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("secrets");
    expect(serialized).not.toContain("environment");
    expect(serialized).not.toMatch(/arn:aws/);
  });
});
