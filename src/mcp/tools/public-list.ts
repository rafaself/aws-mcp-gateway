import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  normalizeObjectSchema,
  type AnySchema,
  type ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import type { ToolSecurityScheme } from "./descriptor.js";
import type { GatewayToolDefinition } from "./registry.js";
import { getPublicTools } from "./registry.js";

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

export type PublicToolDescriptor = {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: unknown;
  securitySchemes: ToolSecurityScheme[];
  _meta: Record<string, unknown>;
};

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

export function buildPublicToolList(
  registry: GatewayToolDefinition[],
  enabledToolNames?: ReadonlySet<string>,
): {
  tools: PublicToolDescriptor[];
} {
  return {
    tools: getPublicTools(registry, enabledToolNames).map((tool) => {
      const securitySchemes = tool.securitySchemes;
      const descriptor: PublicToolDescriptor = {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: toJsonInputSchema(tool.inputSchema),
        annotations: tool.annotations,
        securitySchemes,
        _meta: {
          ...tool._meta,
          securitySchemes,
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

export function registerPublicToolsListHandler(
  server: McpServer,
  registry: GatewayToolDefinition[],
  enabledToolNames?: ReadonlySet<string>,
): void {
  if (typeof server.server?.setRequestHandler !== "function") {
    return;
  }

  server.server.setRequestHandler(ListToolsRequestSchema, () =>
    buildPublicToolList(registry, enabledToolNames),
  );
}
