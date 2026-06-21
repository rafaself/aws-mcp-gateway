export const CHATGPT_TOOL_SEARCH = "search" as const;
export const CHATGPT_TOOL_FETCH = "fetch" as const;

export const CHATGPT_CATALOG_ID_PREFIX = "tool/";

export type ChatGptCatalogEntry = {
  toolName: string;
  title: string;
  description: string;
  keywords: string[];
  docsAnchor: string;
  inputSummary: string;
  awsService?: string;
};

export const CHATGPT_AWS_TOOL_CATALOG: readonly ChatGptCatalogEntry[] = [
  {
    toolName: "get_gateway_status",
    title: "Gateway status",
    description: "Verify the MCP gateway is running and list default region and allowed regions.",
    keywords: ["gateway", "status", "health", "ping", "regions"],
    docsAnchor: "1-get_gateway_status",
    inputSummary: "No parameters.",
    awsService: undefined,
  },
  {
    toolName: "get_aws_cost_summary",
    title: "AWS cost summary",
    description: "Total AWS spend for a date range via Cost Explorer.",
    keywords: ["cost", "billing", "spend", "total", "cost explorer", "budget"],
    docsAnchor: "2-get_aws_cost_summary",
    inputSummary: "startDate, endDate (YYYY-MM-DD), optional granularity DAILY or MONTHLY.",
    awsService: "ce",
  },
  {
    toolName: "get_aws_cost_by_service",
    title: "AWS cost by service",
    description: "AWS spend broken down by service for a date range.",
    keywords: ["cost", "service", "breakdown", "billing", "cost explorer"],
    docsAnchor: "3-get_aws_cost_by_service",
    inputSummary: "startDate, endDate, optional granularity and limit (max 25).",
    awsService: "ce",
  },
  {
    toolName: "list_ec2_instances",
    title: "EC2 instances",
    description: "List EC2 instances across allowed regions with state and instance type.",
    keywords: ["ec2", "instances", "compute", "servers", "inventory", "vms"],
    docsAnchor: "4-list_ec2_instances",
    inputSummary: "Optional regions[] limited to gateway allowlist.",
    awsService: "ec2",
  },
  {
    toolName: "get_cloudwatch_alarms",
    title: "CloudWatch alarms",
    description: "List CloudWatch alarms and their states across allowed regions.",
    keywords: ["cloudwatch", "alarms", "monitoring", "alert", "metrics"],
    docsAnchor: "5-get_cloudwatch_alarms",
    inputSummary: "Optional regions[] and state ALARM, OK, or INSUFFICIENT_DATA.",
    awsService: "cloudwatch",
  },
  {
    toolName: "get_recent_log_errors",
    title: "Recent CloudWatch log errors",
    description: "Recent error events from a CloudWatch Logs group.",
    keywords: ["logs", "cloudwatch logs", "errors", "log group", "debug"],
    docsAnchor: "6-get_recent_log_errors",
    inputSummary: "region, logGroupName, optional limit and lookback hours.",
    awsService: "logs",
  },
] as const;

export type ChatGptSearchResult = {
  id: string;
  title: string;
  url: string;
};

export type ChatGptSearchOutput = {
  results: ChatGptSearchResult[];
};

export type ChatGptFetchOutput = {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata: Record<string, string>;
};

const DOCS_BASE_URL =
  "https://github.com/rafaself/aws-mcp-gateway/blob/main/docs/mcp-tools.md";

export function catalogEntryId(toolName: string): string {
  return `${CHATGPT_CATALOG_ID_PREFIX}${toolName}`;
}

export function parseCatalogEntryId(id: string): string | null {
  if (!id.startsWith(CHATGPT_CATALOG_ID_PREFIX)) {
    return null;
  }
  const toolName = id.slice(CHATGPT_CATALOG_ID_PREFIX.length).trim();
  return toolName.length > 0 ? toolName : null;
}

export function catalogCitationUrl(resourceUrl: string, toolName: string): string {
  const base = resourceUrl.replace(/\/$/, "");
  return `${base}/mcp#tool=${encodeURIComponent(toolName)}`;
}

export function catalogDocsUrl(entry: ChatGptCatalogEntry): string {
  return `${DOCS_BASE_URL}#${entry.docsAnchor}`;
}

function entryHaystack(entry: ChatGptCatalogEntry): string {
  return [entry.toolName, entry.title, entry.description, entry.keywords.join(" ")]
    .join(" ")
    .toLowerCase();
}

function scoreEntry(entry: ChatGptCatalogEntry, query: string): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return 1;
  }

  const haystack = entryHaystack(entry);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  let score = 0;

  for (const token of tokens) {
    if (entry.toolName.toLowerCase().includes(token)) {
      score += 4;
    }
    if (haystack.includes(token)) {
      score += 2;
    }
  }

  return score;
}

export function searchCatalog(
  query: string,
  resourceUrl: string,
  limit = 25,
): ChatGptSearchOutput {
  const ranked = CHATGPT_AWS_TOOL_CATALOG.map((entry) => ({
    entry,
    score: scoreEntry(entry, query),
  }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.toolName.localeCompare(b.entry.toolName));

  const selected =
    ranked.length > 0
      ? ranked
      : CHATGPT_AWS_TOOL_CATALOG.map((entry) => ({ entry, score: 1 }));

  return {
    results: selected.slice(0, limit).map(({ entry }) => ({
      id: catalogEntryId(entry.toolName),
      title: entry.title,
      url: catalogCitationUrl(resourceUrl, entry.toolName),
    })),
  };
}

export function findCatalogEntry(toolName: string): ChatGptCatalogEntry | undefined {
  return CHATGPT_AWS_TOOL_CATALOG.find((entry) => entry.toolName === toolName);
}

export function buildFetchDocument(
  entry: ChatGptCatalogEntry,
  resourceUrl: string,
  liveStatus?: Record<string, unknown>,
): ChatGptFetchOutput {
  const lines = [
    `# ${entry.title}`,
    "",
    entry.description,
    "",
    `MCP tool name: ${entry.toolName}`,
    `Input: ${entry.inputSummary}`,
    entry.awsService ? `AWS service: ${entry.awsService}` : "AWS service: none (gateway-local)",
    "",
    "To retrieve live AWS data, call the MCP tool above with the documented parameters.",
    `Contract reference: ${catalogDocsUrl(entry)}`,
  ];

  if (liveStatus) {
    lines.push("", "## Live gateway status", "", JSON.stringify(liveStatus, null, 2));
  }

  const text = lines.join("\n");

  return {
    id: catalogEntryId(entry.toolName),
    title: entry.title,
    text,
    url: catalogCitationUrl(resourceUrl, entry.toolName),
    metadata: {
      mcpTool: entry.toolName,
      docsUrl: catalogDocsUrl(entry),
      readOnly: "true",
      ...(entry.awsService ? { awsService: entry.awsService } : {}),
    },
  };
}

export function fetchCatalogEntry(
  id: string,
  resourceUrl: string,
  liveStatus?: Record<string, unknown>,
): ChatGptFetchOutput | null {
  const toolName = parseCatalogEntryId(id);
  if (!toolName) {
    return null;
  }

  const entry = findCatalogEntry(toolName);
  if (!entry) {
    return null;
  }

  const statusPayload = entry.toolName === "get_gateway_status" ? liveStatus : undefined;
  return buildFetchDocument(entry, resourceUrl, statusPayload);
}
