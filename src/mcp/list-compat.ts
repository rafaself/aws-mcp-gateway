/**
 * MCP SDK compatibility adapter for public tools/list descriptors.
 *
 * @modelcontextprotocol/sdk@1.29.0 does not surface top-level `securitySchemes`
 * from registerTool config. This module registers a tools/list handler that adds
 * OAuth security metadata while limiting output to public MCP tool fields.
 *
 * Depends on McpServer private `_registeredTools` storage — pinned in package.json.
 */

import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  normalizeObjectSchema,
  type AnySchema,
  type ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { OAUTH_SECURITY_SCHEMES } from "./tools/descriptor.js";

const EMPTY_OBJECT_JSON_SCHEMA = {
  type: "object" as const,
  properties: {},
};

/** Public MCP tool fields returned from tools/list. */
export const PUBLIC_TOOL_LIST_FIELDS = [
  "name",
  "title",
  "description",
  "inputSchema",
  "outputSchema",
  "annotations",
  "securitySchemes",
  "_meta",
] as const;

type RegisteredToolRecord = {
  enabled: boolean;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
  _meta?: Record<string, unknown>;
};

type McpServerInternals = {
  _registeredTools: Record<string, RegisteredToolRecord>;
};

export type PublicToolDescriptor = {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: unknown;
  securitySchemes: typeof OAUTH_SECURITY_SCHEMES extends readonly (infer T)[] ? T[] : never;
  _meta: Record<string, unknown>;
};

function readRegisteredTools(server: McpServer): Record<string, RegisteredToolRecord> {
  return (server as unknown as McpServerInternals)._registeredTools;
}

function toJsonInputSchema(inputSchema: unknown): Record<string, unknown> {
  const obj = normalizeObjectSchema(inputSchema as AnySchema | ZodRawShapeCompat | undefined);
  return obj
    ? (toJsonSchemaCompat(obj, {
        strictUnions: true,
        pipeStrategy: "input",
      }) as Record<string, unknown>)
    : EMPTY_OBJECT_JSON_SCHEMA;
}

function toJsonOutputSchema(outputSchema: unknown): Record<string, unknown> | undefined {
  const obj = normalizeObjectSchema(outputSchema as AnySchema | ZodRawShapeCompat | undefined);
  if (!obj) {
    return undefined;
  }
  return toJsonSchemaCompat(obj, {
    strictUnions: true,
    pipeStrategy: "output",
  }) as Record<string, unknown>;
}

export function buildPublicToolList(server: McpServer): { tools: PublicToolDescriptor[] } {
  const registeredTools = readRegisteredTools(server);

  return {
    tools: Object.entries(registeredTools)
      .filter(([, tool]) => tool.enabled)
      .map(([name, tool]) => {
        const descriptor: PublicToolDescriptor = {
          name,
          title: tool.title,
          description: tool.description,
          inputSchema: toJsonInputSchema(tool.inputSchema),
          annotations: tool.annotations,
          securitySchemes: [...OAUTH_SECURITY_SCHEMES],
          _meta: {
            ...tool._meta,
            securitySchemes: [...OAUTH_SECURITY_SCHEMES],
          },
        };

        const outputSchema = toJsonOutputSchema(tool.outputSchema);
        if (outputSchema) {
          descriptor.outputSchema = outputSchema;
        }

        return descriptor;
      }),
  };
}

export function registerPublicToolsListHandler(server: McpServer): void {
  if (typeof server.server?.setRequestHandler !== "function") {
    return;
  }

  server.server.setRequestHandler(ListToolsRequestSchema, () => buildPublicToolList(server));
}

export function invokeToolsList(server: McpServer): { tools: PublicToolDescriptor[] } {
  return buildPublicToolList(server);
}
