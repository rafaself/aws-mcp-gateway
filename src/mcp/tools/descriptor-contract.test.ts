import { describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { PUBLIC_TOOL_TITLES } from "./descriptor.js";
import { createToolRegistry, PUBLIC_TOOL_NAMES, buildToolRegistryState } from "./registry.js";
import { buildPublicToolList } from "./public-list.js";

const testContext = createTestGatewayContext({
  mcpResourceUrl: "https://aws-mcp-gateway.example.workers.dev",
});

const CHATGPT_CONNECTOR_TOOLS = ["search", "fetch"] as const;

const AWS_BACKED_TOOLS = [
  "get_aws_cost_summary",
  "get_aws_cost_by_service",
  "list_ec2_instances",
  "get_cloudwatch_alarms",
  "get_cloudwatch_logs",
  "get_cloudwatch_alarm_summary",
  "get_recent_log_errors",
  "list_lambda_functions",
  "list_s3_buckets",
  "list_log_groups",
  "get_ecs_service_health",
  "list_ecs_tasks",
  "get_recent_stopped_ecs_tasks",
  "get_rds_instance_health",
  "get_rds_metrics",
] as const;

const AGGREGATE_TOOLS = [
  "aws_account_overview",
  "aws_cost_overview",
  "aws_observability_overview",
] as const;

const LOCAL_TOOLS = ["get_gateway_status", ...CHATGPT_CONNECTOR_TOOLS] as const;

const STRUCTURED_OUTPUT_TOOLS = [
  ...CHATGPT_CONNECTOR_TOOLS,
  "get_gateway_status",
  ...AWS_BACKED_TOOLS,
] as const;

const PUBLIC_TOOLS = [...LOCAL_TOOLS, ...AWS_BACKED_TOOLS] as const;

const OAUTH_SECURITY = [{ type: "oauth2" as const, scopes: ["aws:read"] }];

describe("MCP tool registry", () => {
  const registry = createToolRegistry(testContext);

  it("contains exactly the expected public tools", () => {
    expect(registry.map((tool) => tool.name).sort()).toEqual([...PUBLIC_TOOL_NAMES].sort());
  });
});

describe("MCP tool descriptor contract", () => {
  const { registry, policyContext } = buildToolRegistryState(testContext);
  const { tools } = buildPublicToolList(registry, policyContext.enabledToolNames);
  const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

  it("lists every public tool", () => {
    expect(tools.map((tool) => tool.name).sort()).toEqual([...PUBLIC_TOOLS].sort());
  });

  for (const toolName of PUBLIC_TOOLS) {
    it(`${toolName} has non-empty name, title, and description`, () => {
      const tool = toolsByName[toolName];
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.title?.length).toBeGreaterThan(0);
      expect(tool.description?.length).toBeGreaterThan(0);
    });

    it(`${toolName} has the stable public title`, () => {
      expect(toolsByName[toolName].title).toBe(
        PUBLIC_TOOL_TITLES[toolName as keyof typeof PUBLIC_TOOL_TITLES],
      );
    });

    it(`${toolName} has an inputSchema object`, () => {
      expect(toolsByName[toolName].inputSchema).toMatchObject({ type: "object" });
    });

    it(`${toolName} advertises OAuth security metadata`, () => {
      const tool = toolsByName[toolName];

      expect(tool.securitySchemes).toEqual(OAUTH_SECURITY);
      expect((tool._meta as { securitySchemes: unknown }).securitySchemes).toEqual(OAUTH_SECURITY);
      expect((tool._meta as Record<string, unknown>)["mcp/www_authenticate"]).toBeUndefined();
    });
  }

  for (const toolName of PUBLIC_TOOLS) {
    it(`${toolName} declares read-only annotations`, () => {
      const annotations = toolsByName[toolName].annotations as Record<string, boolean>;

      expect(annotations.readOnlyHint).toBe(true);
      expect(annotations.destructiveHint).toBe(false);
    });
  }

  for (const toolName of AWS_BACKED_TOOLS) {
    it(`${toolName} advertises external read-only access`, () => {
      const annotations = toolsByName[toolName].annotations as Record<string, boolean>;

      expect(annotations.openWorldHint).toBe(true);
    });
  }

  it("get_gateway_status is local and idempotent", () => {
    const annotations = toolsByName.get_gateway_status.annotations as Record<string, boolean>;

    expect(annotations.openWorldHint).toBe(false);
    expect(annotations.idempotentHint).toBe(true);
  });

  it("ChatGPT connector tools are local discovery helpers", () => {
    for (const toolName of CHATGPT_CONNECTOR_TOOLS) {
      const annotations = toolsByName[toolName].annotations as Record<string, boolean>;
      expect(annotations.openWorldHint).toBe(false);
      expect(annotations.idempotentHint).toBe(true);
    }
  });

  for (const toolName of STRUCTURED_OUTPUT_TOOLS) {
    it(`${toolName} declares outputSchema`, () => {
      expect(toolsByName[toolName].outputSchema).toBeDefined();
      expect(toolsByName[toolName].outputSchema).toMatchObject({ type: "object" });
    });
  }

  it("does not advertise write scopes or management scopes", () => {
    const serialized = JSON.stringify(tools);

    expect(serialized).not.toContain("aws:write");
    expect(serialized).not.toContain("management");
    expect(serialized).not.toContain("AKIA");
    expect(serialized).not.toContain("secret");
    for (const tool of tools) {
      expect(tool).not.toHaveProperty("execution");
    }
    expect(serialized).not.toContain("run_aws_cli");
    expect(serialized).not.toContain("call_any_aws_api");
  });

  it("no public tool advertises noauth", () => {
    expect(JSON.stringify(tools)).not.toContain('"type":"noauth"');
  });

  it("does not embed hardcoded OAuth discovery URLs in tool descriptors", () => {
    const serialized = JSON.stringify(tools);

    expect(serialized).not.toContain("gateway.example.com");
    expect(serialized).not.toContain("auth.example.com");
  });
});

describe("security MCP tool descriptor contract", () => {
  const ctx = createTestGatewayContext({
    mcpResourceUrl: "https://aws-mcp-gateway.example.workers.dev",
    toolExposure: {
      ...testContext.toolExposure,
      enabledToolPacks: new Set([
        "core",
        "cost",
        "inventory",
        "observability",
        "database",
        "security",
      ]),
    },
  });
  const { registry, policyContext } = buildToolRegistryState(ctx);
  const { tools } = buildPublicToolList(registry, policyContext.enabledToolNames);
  const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

  it("check_ssm_parameter_inventory is listed when security pack is enabled", () => {
    expect(toolsByName.check_ssm_parameter_inventory).toBeDefined();
    expect(toolsByName.check_ssm_parameter_inventory.outputSchema).toMatchObject({
      type: "object",
    });
    expect(toolsByName.check_ssm_parameter_inventory.title).toBe(
      PUBLIC_TOOL_TITLES.check_ssm_parameter_inventory,
    );
  });
});

describe("aggregate MCP tool descriptor contract", () => {
  const ctx = createTestGatewayContext({
    mcpResourceUrl: "https://aws-mcp-gateway.example.workers.dev",
    toolExposure: {
      ...testContext.toolExposure,
      enabledToolPacks: new Set([
        "core",
        "cost",
        "inventory",
        "observability",
        "aggregates",
      ]),
    },
  });
  const { registry, policyContext } = buildToolRegistryState(ctx);
  const { tools } = buildPublicToolList(registry, policyContext.enabledToolNames);
  const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

  for (const toolName of AGGREGATE_TOOLS) {
    it(`${toolName} is listed when aggregates pack is enabled`, () => {
      expect(toolsByName[toolName]).toBeDefined();
      expect(toolsByName[toolName].outputSchema).toMatchObject({ type: "object" });
      expect(toolsByName[toolName].title).toBe(
        PUBLIC_TOOL_TITLES[toolName as keyof typeof PUBLIC_TOOL_TITLES],
      );
    });
  }
});
