import { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ValidatedOAuthConfig } from "../../auth/oauth/types.js";
import { buildMcpWwwAuthenticateMeta } from "../../auth/oauth/challenge.js";

export const OAUTH_REQUIRED_SCOPE = "aws:read";

export const OAUTH_SECURITY_SCHEMES = [
  { type: "oauth2" as const, scopes: [OAUTH_REQUIRED_SCOPE] },
] as const;

export type OAuthSecurityScheme = (typeof OAUTH_SECURITY_SCHEMES)[number];

type OAuthToolMetadata = {
  securitySchemes: OAuthSecurityScheme[];
  _meta: { securitySchemes: OAuthSecurityScheme[]; [key: string]: unknown };
  annotations: ToolAnnotations;
};

const AWS_READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
};

const STATUS_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};

const DEFAULT_OAUTH_CONFIG: ValidatedOAuthConfig = {
  MCP_RESOURCE_URL: "https://gateway.example.com",
  OAUTH_ISSUER: "https://auth.example.com/",
  OAUTH_AUDIENCE: "https://gateway.example.com",
  OAUTH_JWKS_URI: "https://auth.example.com/.well-known/jwks.json",
  OAUTH_REQUIRED_SCOPES: [OAUTH_REQUIRED_SCOPE],
};

function oauthDescriptorMeta(): Record<string, unknown> {
  return {
    securitySchemes: [...OAUTH_SECURITY_SCHEMES],
    "mcp/www_authenticate": buildMcpWwwAuthenticateMeta(DEFAULT_OAUTH_CONFIG),
  };
}

export function withOAuthToolMetadata<T extends Record<string, unknown>>(
  descriptor: T,
  annotations: ToolAnnotations,
): T & OAuthToolMetadata {
  const meta: OAuthToolMetadata["_meta"] = {
    ...oauthDescriptorMeta(),
    ...(typeof descriptor._meta === "object" && descriptor._meta !== null
      ? (descriptor._meta as Record<string, unknown>)
      : {}),
    securitySchemes: [...OAUTH_SECURITY_SCHEMES],
  };

  return {
    ...descriptor,
    securitySchemes: [...OAUTH_SECURITY_SCHEMES],
    _meta: meta,
    annotations,
  };
}

export function readOnlyAwsToolDescriptor<T extends Record<string, unknown>>(
  descriptor: T,
): T & OAuthToolMetadata {
  return withOAuthToolMetadata(descriptor, AWS_READ_ONLY_ANNOTATIONS);
}

export function localStatusToolDescriptor<T extends Record<string, unknown>>(
  descriptor: T,
): T & OAuthToolMetadata {
  return withOAuthToolMetadata(descriptor, STATUS_ANNOTATIONS);
}

export const costPeriodSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

export const costSummaryOutputSchema = z.object({
  period: costPeriodSchema,
  granularity: z.enum(["DAILY", "MONTHLY"]),
  total: z.number(),
  currency: z.string(),
});

export const costByServiceOutputSchema = costSummaryOutputSchema.extend({
  services: z.array(
    z.object({
      service: z.string(),
      amount: z.number(),
    }),
  ),
});

export const listEc2InstancesOutputSchema = z.object({
  regions: z.array(z.string()),
  count: z.number(),
  instances: z.array(
    z.object({
      instanceId: z.string(),
      region: z.string(),
      state: z.string(),
      instanceType: z.string(),
      name: z.string(),
    }),
  ),
});

export const cloudwatchAlarmsOutputSchema = z.object({
  regions: z.array(z.string()),
  count: z.number(),
  alarms: z.array(
    z.object({
      name: z.string(),
      region: z.string(),
      state: z.enum(["ALARM", "INSUFFICIENT_DATA", "OK"]),
      reason: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

export const recentLogErrorsOutputSchema = z.object({
  region: z.string(),
  logGroupName: z.string(),
  count: z.number(),
  events: z.array(
    z.object({
      timestamp: z.string(),
      logStreamName: z.string(),
      message: z.string(),
    }),
  ),
});
