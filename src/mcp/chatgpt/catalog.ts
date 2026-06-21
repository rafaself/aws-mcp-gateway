import type { ChatGptCatalogEntry } from "../tools/registry.js";

export const CHATGPT_TOOL_SEARCH = "search" as const;
export const CHATGPT_TOOL_FETCH = "fetch" as const;

export const CHATGPT_CATALOG_ID_PREFIX = "tool/";

export type { ChatGptCatalogEntry };

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
  entries: readonly ChatGptCatalogEntry[],
  limit = 25,
): ChatGptSearchOutput {
  const ranked = entries
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.toolName.localeCompare(b.entry.toolName));

  const selected =
    ranked.length > 0
      ? ranked
      : entries.map((entry) => ({ entry, score: 1 }));

  return {
    results: selected.slice(0, limit).map(({ entry }) => ({
      id: catalogEntryId(entry.toolName),
      title: entry.title,
      url: catalogCitationUrl(resourceUrl, entry.toolName),
    })),
  };
}

export function findCatalogEntry(
  toolName: string,
  entries: readonly ChatGptCatalogEntry[],
): ChatGptCatalogEntry | undefined {
  return entries.find((entry) => entry.toolName === toolName);
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
  entries: readonly ChatGptCatalogEntry[],
  liveStatus?: Record<string, unknown>,
): ChatGptFetchOutput | null {
  const toolName = parseCatalogEntryId(id);
  if (!toolName) {
    return null;
  }

  const entry = findCatalogEntry(toolName, entries);
  if (!entry) {
    return null;
  }

  const statusPayload = entry.toolName === "get_gateway_status" ? liveStatus : undefined;
  return buildFetchDocument(entry, resourceUrl, statusPayload);
}
