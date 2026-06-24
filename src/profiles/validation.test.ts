import { describe, expect, it } from "vitest";
import { ValidationError } from "../security/errors.js";
import {
  assertNoSecretLikeContent,
  resolveProfileAuth,
  validateProfileDocument,
  validateProfileId,
  validateProfileIndexDocument,
} from "./validation.js";

const ALLOWED_REGIONS = ["us-east-1", "sa-east-1"];

const validIndex = {
  version: 1,
  profiles: [
    {
      id: "example-prod",
      displayName: "Example Production",
      environment: "production",
      region: "us-east-1",
      enabled: true,
      aliases: ["example", "prod"],
      capabilities: ["ecs", "rds", "logs"],
    },
  ],
};

const validProfile = {
  version: 1,
  id: "example-prod",
  displayName: "Example Production",
  environment: "production",
  region: "us-east-1",
  auth: { strategy: "default" },
  resources: {
    ecs: {
      clusterName: "example-production",
      serviceName: "example-production-api",
      logGroupName: "/ecs/example-production",
      containers: ["api"],
    },
    rds: {
      dbInstanceIdentifier: "example-production",
    },
    ses: {
      auth: {
        strategy: "assume-role",
        roleArn: "arn:aws:iam::123456789012:role/AwsMcpGatewaySesReadOnly",
      },
      configurationSetName: "example-production",
    },
  },
};

describe("validateProfileId", () => {
  it("accepts safe profile ids", () => {
    expect(validateProfileId("example-prod")).toBe("example-prod");
    expect(validateProfileId("a1")).toBe("a1");
  });

  it("rejects invalid profile ids", () => {
    expect(() => validateProfileId("")).toThrow(ValidationError);
    expect(() => validateProfileId("UPPER")).toThrow(ValidationError);
    expect(() => validateProfileId("../escape")).toThrow(ValidationError);
  });
});

describe("validateProfileIndexDocument", () => {
  it("accepts a valid index", () => {
    const index = validateProfileIndexDocument(validIndex, ALLOWED_REGIONS);
    expect(index.profiles).toHaveLength(1);
    expect(index.profiles[0]?.id).toBe("example-prod");
  });

  it("rejects invalid version", () => {
    expect(() =>
      validateProfileIndexDocument({ ...validIndex, version: 2 }, ALLOWED_REGIONS),
    ).toThrow(ValidationError);
  });

  it("rejects disallowed region", () => {
    expect(() =>
      validateProfileIndexDocument(
        {
          version: 1,
          profiles: [{ ...validIndex.profiles[0], region: "eu-west-1" }],
        },
        ALLOWED_REGIONS,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects duplicate profile ids", () => {
    expect(() =>
      validateProfileIndexDocument(
        {
          version: 1,
          profiles: [validIndex.profiles[0], validIndex.profiles[0]],
        },
        ALLOWED_REGIONS,
      ),
    ).toThrow(ValidationError);
  });

  it("accepts empty profiles array", () => {
    const index = validateProfileIndexDocument({ version: 1, profiles: [] }, ALLOWED_REGIONS);
    expect(index.profiles).toEqual([]);
  });
});

describe("validateProfileDocument", () => {
  it("accepts a valid profile matching issue example", () => {
    const profile = validateProfileDocument(validProfile, "example-prod", ALLOWED_REGIONS);
    expect(profile.id).toBe("example-prod");
    expect(profile.resources.ecs?.clusterName).toBe("example-production");
    expect(profile.resources.ses?.auth?.strategy).toBe("assume-role");
  });

  it("rejects id mismatch with requested profileId", () => {
    expect(() =>
      validateProfileDocument(
        { ...validProfile, id: "other-id" },
        "example-prod",
        ALLOWED_REGIONS,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects profile without resource blocks", () => {
    expect(() =>
      validateProfileDocument(
        { ...validProfile, resources: {} },
        "example-prod",
        ALLOWED_REGIONS,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects invalid version", () => {
    expect(() =>
      validateProfileDocument({ ...validProfile, version: 2 }, "example-prod", ALLOWED_REGIONS),
    ).toThrow(ValidationError);
  });

  it("rejects disallowed region", () => {
    expect(() =>
      validateProfileDocument(
        { ...validProfile, region: "eu-west-1" },
        "example-prod",
        ALLOWED_REGIONS,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects user ARN instead of role ARN", () => {
    expect(() =>
      validateProfileDocument(
        {
          ...validProfile,
          resources: {
            ses: {
              configurationSetName: "example-production",
              auth: {
                strategy: "assume-role",
                roleArn: "arn:aws:iam::123456789012:user/SomeUser",
              },
            },
          },
        },
        "example-prod",
        ALLOWED_REGIONS,
      ),
    ).toThrow(ValidationError);
  });

  it("accepts resource-level auth on sns block", () => {
    const profile = validateProfileDocument(
      {
        ...validProfile,
        resources: {
          sns: {
            auth: {
              strategy: "assume-role",
              roleArn: "arn:aws:iam::123456789012:role/AwsMcpGatewayAlertsReadOnly",
            },
            topicName: "example-alerts",
          },
        },
      },
      "example-prod",
      ALLOWED_REGIONS,
    );
    expect(profile.resources.sns?.auth?.strategy).toBe("assume-role");
    expect(profile.resources.sns?.topicName).toBe("example-alerts");
  });

  it("accepts resource-level auth on ecs block with externalId", () => {
    const profile = validateProfileDocument(
      {
        ...validProfile,
        resources: {
          ecs: {
            clusterName: "example-production",
            serviceName: "example-production-api",
            auth: {
              strategy: "assume-role",
              roleArn: "arn:aws:iam::123456789012:role/EcsReadOnly",
              externalId: "trusted-external-id",
            },
          },
        },
      },
      "example-prod",
      ALLOWED_REGIONS,
    );
    expect(profile.resources.ecs?.auth?.strategy).toBe("assume-role");
    if (profile.resources.ecs?.auth?.strategy === "assume-role") {
      expect(profile.resources.ecs.auth.externalId).toBe("trusted-external-id");
    }
  });

  it("rejects user ARN on non-SES resource block", () => {
    expect(() =>
      validateProfileDocument(
        {
          ...validProfile,
          resources: {
            sns: {
              topicName: "example-alerts",
              auth: {
                strategy: "assume-role",
                roleArn: "arn:aws:iam::123456789012:user/SomeUser",
              },
            },
          },
        },
        "example-prod",
        ALLOWED_REGIONS,
      ),
    ).toThrow(ValidationError);
  });
});

describe("assertNoSecretLikeContent", () => {
  it("rejects secret-looking strings", () => {
    expect(() => assertNoSecretLikeContent("password=abc", "field")).toThrow(ValidationError);
    expect(() => assertNoSecretLikeContent("postgres://user:pass@host/db", "field")).toThrow(
      ValidationError,
    );
    const fakeAccessKey = "AKIA" + "IOSFODNN7EXAMPLE";
    expect(() => assertNoSecretLikeContent(fakeAccessKey, "field")).toThrow(ValidationError);
    expect(() => assertNoSecretLikeContent("AWS_SECRET_ACCESS_KEY", "field")).toThrow(
      ValidationError,
    );
    expect(() => assertNoSecretLikeContent("DATABASE_URL", "field")).toThrow(ValidationError);
    expect(() => assertNoSecretLikeContent("JWT_SECRET", "field")).toThrow(ValidationError);
    expect(() => assertNoSecretLikeContent("bearer eyJhbGciOiJIUzI1NiJ9", "field")).toThrow(
      ValidationError,
    );
  });
});

describe("resolveProfileAuth", () => {
  it("defaults to default strategy when auth is absent", () => {
    expect(resolveProfileAuth(undefined)).toEqual({ strategy: "default" });
  });

  it("preserves explicit auth", () => {
    const auth = {
      strategy: "assume-role" as const,
      roleArn: "arn:aws:iam::123456789012:role/ReadOnly",
    };
    expect(resolveProfileAuth(auth)).toBe(auth);
  });
});
