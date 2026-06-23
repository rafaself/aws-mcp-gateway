import { z } from "zod";
import { toolExecutionMetadataSchema } from "./metadata.js";

export const toolExecutionMetadataOutputField = toolExecutionMetadataSchema.optional();

export function withOptionalExecutionMetadata<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).extend({ execution: toolExecutionMetadataOutputField });
}
