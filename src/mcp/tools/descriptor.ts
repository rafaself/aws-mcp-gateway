import { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export const OAUTH_REQUIRED_SCOPE = "aws:read";

export const OAUTH_SECURITY_SCHEMES = [
  { type: "oauth2" as const, scopes: [OAUTH_REQUIRED_SCOPE] },
] as const;

export const CHATGPT_MIXED_SECURITY_SCHEMES = [
  { type: "noauth" as const },
  { type: "oauth2" as const, scopes: [OAUTH_REQUIRED_SCOPE] },
] as const;

export type OAuthSecurityScheme = (typeof OAUTH_SECURITY_SCHEMES)[number];
export type ChatGptMixedSecurityScheme = (typeof CHATGPT_MIXED_SECURITY_SCHEMES)[number];
export type ToolSecurityScheme = OAuthSecurityScheme | { type: "noauth" };

type OAuthToolMetadata = {
  securitySchemes: OAuthSecurityScheme[];
  _meta: { securitySchemes: OAuthSecurityScheme[]; [key: string]: unknown };
  annotations: ToolAnnotations;
};

export const AWS_READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
};

export const STATUS_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};

function oauthDescriptorMeta(): Record<string, unknown> {
  return {
    securitySchemes: [...OAUTH_SECURITY_SCHEMES],
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

type ChatGptToolMetadata = {
  securitySchemes: ChatGptMixedSecurityScheme[];
  _meta: { securitySchemes: ChatGptMixedSecurityScheme[]; [key: string]: unknown };
  annotations: ToolAnnotations;
};

function chatgptDescriptorMeta(
  securitySchemes: readonly ChatGptMixedSecurityScheme[] | readonly OAuthSecurityScheme[],
): Record<string, unknown> {
  return {
    securitySchemes: [...securitySchemes],
  };
}

function withChatGptToolMetadata<T extends Record<string, unknown>>(
  descriptor: T,
  securitySchemes: readonly ChatGptMixedSecurityScheme[] | readonly OAuthSecurityScheme[],
  annotations: ToolAnnotations,
): T & ChatGptToolMetadata {
  const meta: ChatGptToolMetadata["_meta"] = {
    ...chatgptDescriptorMeta(securitySchemes),
    ...(typeof descriptor._meta === "object" && descriptor._meta !== null
      ? (descriptor._meta as Record<string, unknown>)
      : {}),
    securitySchemes: [...securitySchemes],
  };

  return {
    ...descriptor,
    securitySchemes: [...securitySchemes],
    _meta: meta,
    annotations,
  };
}

export const CHATGPT_DISCOVERY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};

export const chatgptSearchInputSchema = z.object({
  query: z.string().describe("Natural language search query for AWS read-only MCP tools."),
});

export const chatgptFetchInputSchema = z.object({
  id: z.string().describe("Catalog document id returned by the search tool."),
});

export const chatgptSearchOutputSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
    }),
  ),
});

export const chatgptFetchOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  metadata: z.record(z.string(), z.string()),
});

export function chatgptSearchToolDescriptor<T extends Record<string, unknown>>(
  descriptor: T,
): T & ChatGptToolMetadata {
  return withChatGptToolMetadata(descriptor, CHATGPT_MIXED_SECURITY_SCHEMES, CHATGPT_DISCOVERY_ANNOTATIONS);
}

export function chatgptFetchToolDescriptor<T extends Record<string, unknown>>(
  descriptor: T,
): T & ChatGptToolMetadata {
  return withChatGptToolMetadata(descriptor, OAUTH_SECURITY_SCHEMES, CHATGPT_DISCOVERY_ANNOTATIONS);
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
