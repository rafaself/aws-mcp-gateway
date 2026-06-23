import type { ToolExecutionMetadata } from "./metadata.js";
import { parseToolExecutionMetadata } from "./metadata.js";

export function attachExecutionMetadata<T extends Record<string, unknown>>(
  structuredContent: T,
  execution: ToolExecutionMetadata,
): T & { execution: ToolExecutionMetadata } {
  const validated = parseToolExecutionMetadata(execution);

  return {
    ...structuredContent,
    execution: validated,
  };
}
