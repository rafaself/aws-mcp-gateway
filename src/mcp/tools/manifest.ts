import type { z } from "zod";
import type { GatewayContext } from "../../config/context.js";
import {
  chatgptDiscoveryToolDescriptor,
  localStatusToolDescriptor,
  OAUTH_REQUIRED_SCOPE,
  readOnlyAwsToolDescriptor,
} from "./descriptor.js";
import { evaluateToolPolicy, type ToolPolicyContext } from "./policy.js";
import { safeMcpHandler } from "./response.js";
import type {
  GatewayToolCatalogMetadata,
  GatewayToolDefinition,
  GatewayToolHandler,
  GatewayToolVisibility,
} from "./registry.js";
import type { McpSuccessResult } from "./response.js";
import type { mcpErrorResult } from "../../errors/public-error.js";

export type ToolPack = "core" | "cost" | "inventory" | "observability";

export type ToolLifecycle = "stable";

export type ToolRiskLevel = "read-only";

export type AwsRegionMode = "none" | "single-region" | "bounded-multi-region";

export type CostClass = "none" | "cached-read";

export type ToolDescriptorKind = "aws-readonly" | "local-status" | "chatgpt-discovery";

export type ToolManifestAudit<TInput = Record<string, unknown>> = {
  awsService?: string;
  getRegion?: (args: TInput) => string | undefined;
  sanitizeInput: (args: TInput) => Record<string, unknown>;
};

export type ToolManifestHandler<TInput> = (
  args: TInput,
) => Promise<McpSuccessResult | ReturnType<typeof mcpErrorResult>>;

export type ToolManifest<TInput = Record<string, unknown>> = {
  name: string;
  title: string;
  description: string;
  pack: ToolPack;
  lifecycle: ToolLifecycle;
  inputSchema?: z.ZodTypeAny | z.ZodRawShape;
  outputSchema?: z.ZodTypeAny;
  visibility: GatewayToolVisibility;
  catalog?: GatewayToolCatalogMetadata;
  auth: {
    requiredScopes: string[];
  };
  aws: {
    services: string[];
    actions: string[];
    regionMode: AwsRegionMode;
    readonly: true;
  };
  safety: {
    riskLevel: ToolRiskLevel;
    cacheTtlSeconds: number;
    timeoutMs: number;
    costClass: CostClass;
  };
  audit: ToolManifestAudit<TInput>;
  descriptorKind: ToolDescriptorKind;
  handler: ToolManifestHandler<TInput>;
};

export const DEFAULT_AUTH_SCOPES = [OAUTH_REQUIRED_SCOPE] as const;

export function manifestToGatewayDefinition<TInput>(
  manifest: ToolManifest<TInput>,
  policyContext: ToolPolicyContext,
): GatewayToolDefinition {
  const descriptor = {
    name: manifest.name,
    title: manifest.title,
    description: manifest.description,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    visibility: manifest.visibility,
    catalog: manifest.catalog,
    handler: wrapManifestHandler(manifest, policyContext),
  };

  switch (manifest.descriptorKind) {
    case "aws-readonly":
      return readOnlyAwsToolDescriptor(descriptor);
    case "local-status":
      return localStatusToolDescriptor(descriptor);
    case "chatgpt-discovery":
      return chatgptDiscoveryToolDescriptor(descriptor);
  }
}

function wrapManifestHandler<TInput>(
  manifest: ToolManifest<TInput>,
  policyContext: ToolPolicyContext,
): GatewayToolHandler {
  return safeMcpHandler(
    {
      toolName: manifest.name,
      awsService: manifest.audit.awsService,
      getRegion: manifest.audit.getRegion,
      sanitizeInput: manifest.audit.sanitizeInput,
    },
    async (args: TInput) => {
      const denial = evaluateToolPolicy(
        manifest as AnyToolManifest,
        policyContext,
        args as Record<string, unknown>,
      );
      if (denial) {
        throw denial;
      }

      return (manifest.handler as (args: TInput) => Promise<McpSuccessResult>)(args);
    },
  );
}

export type AnyToolManifest = ToolManifest<Record<string, unknown>>;

export type ToolManifestFactory = (ctx: GatewayContext) => AnyToolManifest;
