# Issue #3: Add stateless MCP endpoint at /mcp

## Summary
Add a remote MCP endpoint at `/mcp` using the MCP SDK + Cloudflare Agents helpers, with a single diagnostic tool (`get_gateway_status`). No AWS integrations yet.

## Files to change

| File | Action | Purpose |
|---|---|---|
| `package.json` | Update | Add `@modelcontextprotocol/sdk`, `agents`, `zod` |
| `src/mcp/tools.ts` | Create | `get_gateway_status` diagnostic tool |
| `src/mcp/server.ts` | Create | Per-request `McpServer` factory |
| `src/index.ts` | Update | Route `/mcp` via `createMcpHandler`, keep `/health` |

## Implementation

### Dependencies
```
npm install @modelcontextprotocol/sdk agents zod
```

### src/mcp/tools.ts
- Export `registerDiagnosticTools(server: McpServer): void`
- Register `get_gateway_status` tool with no params
- Returns static JSON: `{ service: "aws-mcp-gateway", status: "ok", mode: "read-only" }`

### src/mcp/server.ts
- Export `createServer(): McpServer`
- Create new `McpServer({ name: "aws-mcp-gateway", version: "0.1.0" })`
- Call `registerDiagnosticTools(server)`
- Return server

### src/index.ts
- Import `createMcpHandler` from `agents/mcp`
- Import `createServer` from `./mcp/server.js`
- Route `/mcp` → `createMcpHandler(createServer())(request)`
- Keep `/health` endpoint
- Keep 404 fallback

## Verification
- `npm run typecheck` passes
- `wrangler dev` and MCP Inspector discover the server
- `get_gateway_status` returns static status
