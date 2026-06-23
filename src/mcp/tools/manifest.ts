import type { z } from "zod";
import type { AwsCapabilityId } from "../../aws/capabilities.js";
import type { GatewayContext } from "../../config/context.js";
import { attachExecutionMetadata } from "../execution/attach.js";
import { buildAwsExecutionMetadataFromManifest } from "../execution/build.js";
import { buildRuntimeFactsFromSnapshot } from "../execution/runtime-facts.js";
import {
  chatgptDiscoveryToolDescriptor,
  localStatusToolDescriptor,
  OAUTH_REQUIRED_SCOPE,
  readOnlyAwsToolDescriptor,
} from "./descriptor.js";
import { evaluateToolPolicy, isAwsBackedManifest, type ToolPolicyContext } from "./policy.js";
import { safeMcpHandler } from "./response.js";
import type {
  GatewayToolCatalogMetadata,
  GatewayToolDefinition,
  GatewayToolHandler,
  GatewayToolVisibility,
} from "./registry.js";
import type { McpSuccessResult } from "./response.js";
import type { mcpErrorResult } from "../../errors/public-error.js";

import type { ConfigToolPack } from "../../config/tool-exposure.js";

export type { AwsCapabilityId } from "../../aws/capabilities.js";

export type ToolPack = ConfigToolPack;

export type ToolLifecycle = "stable";

export type ToolRiskLevel = "read-only";

export type AwsRegionMode = "none" | "global" | "single-region" | "bounded-multi-region";

export type CostClass = "none" | "cached-read";

export type CostControlClass =
  | "free"
  | "low"
  | "paid"
  | "volume-sensitive"
  | "fanout-sensitive";

export type ToolCostControl = {
  class: CostControlClass;
  requiresCache: boolean;
  timeoutMs: number;
  maxRegions?: number;
  maxDateRangeDays?: number;
  maxResultCount?: number;
  maxLookbackHours?: number;
  minCacheTtlSeconds?: number;
};

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
    capabilities: AwsCapabilityId[];
    regionMode: AwsRegionMode;
    readonly: true;
  };
  safety: {
    riskLevel: ToolRiskLevel;
    cacheTtlSeconds: number;
    timeoutMs: number;
    costClass: CostClass;
  };
  costControl: ToolCostControl;
  audit: ToolManifestAudit<TInput>;
  descriptorKind: ToolDescriptorKind;
  handler: ToolManifestHandler<TInput>;
};

export const DEFAULT_AUTH_SCOPES = [OAUTH_REQUIRED_SCOPE] as const;

export function manifestToGatewayDefinition<TInput>(
  manifest: ToolManifest<TInput>,
  policyContext: ToolPolicyContext,
  ctx: GatewayContext,
): GatewayToolDefinition {
  const descriptor = {
    name: manifest.name,
    title: manifest.title,
    description: manifest.description,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    visibility: manifest.visibility,
    catalog: manifest.catalog,
    handler: wrapManifestHandler(manifest, policyContext, ctx),
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
  ctx: GatewayContext,
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

      ctx.execution.reset();

      const result = await (manifest.handler as (args: TInput) => Promise<McpSuccessResult>)(args);

      if (
        isAwsBackedManifest(manifest as AnyToolManifest) &&
        result.structuredContent &&
        !("error" in result.structuredContent)
      ) {
        const facts = buildRuntimeFactsFromSnapshot(manifest as AnyToolManifest, ctx.execution.snapshot());
        const execution = buildAwsExecutionMetadataFromManifest(manifest as AnyToolManifest, facts);
        result.structuredContent = attachExecutionMetadata(result.structuredContent, execution);
      }

      return result;
    },
  );
}

export type AnyToolManifest = ToolManifest<Record<string, unknown>>;

export type ToolManifestFactory = (ctx: GatewayContext) => AnyToolManifest;
