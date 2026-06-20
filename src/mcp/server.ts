import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  normalizeObjectSchema,
  type AnySchema,
  type ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import type { GatewayContext } from "../config/context.js";
import { registerTools } from "./tools/index.js";
import { OAUTH_SECURITY_SCHEMES } from "./tools/descriptor.js";

const EMPTY_OBJECT_JSON_SCHEMA = {
  type: "object" as const,
  properties: {},
};

type RegisteredToolsStore = Record<
  string,
  {
    enabled: boolean;
    title?: string;
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
    annotations?: unknown;
    execution?: unknown;
    _meta?: Record<string, unknown>;
  }
>;

function buildListedTools(server: McpServer): { tools: Record<string, unknown>[] } {
  const registeredTools = (server as unknown as { _registeredTools: RegisteredToolsStore })
    ._registeredTools;

  return {
    tools: Object.entries(registeredTools)
      .filter(([, tool]) => tool.enabled)
      .map(([name, tool]) => {
        const toolDefinition: Record<string, unknown> = {
          name,
          title: tool.title,
          description: tool.description,
          inputSchema: (() => {
            const obj = normalizeObjectSchema(
              tool.inputSchema as AnySchema | ZodRawShapeCompat | undefined,
            );
            return obj
              ? toJsonSchemaCompat(obj, {
                  strictUnions: true,
                  pipeStrategy: "input",
                })
              : EMPTY_OBJECT_JSON_SCHEMA;
          })(),
          annotations: tool.annotations,
          execution: tool.execution,
          securitySchemes: [...OAUTH_SECURITY_SCHEMES],
          _meta: {
            ...tool._meta,
            securitySchemes: [...OAUTH_SECURITY_SCHEMES],
          },
        };

        if (tool.outputSchema) {
          const obj = normalizeObjectSchema(
            tool.outputSchema as AnySchema | ZodRawShapeCompat | undefined,
          );
          if (obj) {
            toolDefinition.outputSchema = toJsonSchemaCompat(obj, {
              strictUnions: true,
              pipeStrategy: "output",
            });
          }
        }

        return toolDefinition;
      }),
  };
}

function enrichListedTools(server: McpServer): void {
  if (typeof server.server?.setRequestHandler !== "function") {
    return;
  }

  server.server.setRequestHandler(ListToolsRequestSchema, () => buildListedTools(server));
}

export function listToolsSnapshot(server: McpServer): { tools: Record<string, unknown>[] } {
  return buildListedTools(server);
}

export function createServer(ctx: GatewayContext): McpServer {
  const server = new McpServer({
    name: "aws-mcp-gateway",
    version: "0.1.0",
  });

  registerTools(server, ctx);
  enrichListedTools(server);

  return server;
}
