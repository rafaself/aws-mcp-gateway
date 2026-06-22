import type { AnyToolManifest, ToolPack, ToolRiskLevel } from "./manifest.js";
import type { ResolvedToolExposure } from "../../config/tool-exposure.js";

export {
  DEFAULT_ENABLED_TOOL_PACKS,
  PUBLIC_TOOL_NAMES,
  type PublicToolName,
} from "../../config/tool-exposure.js";

export function resolveExposedToolNames(
  manifests: ReadonlyArray<AnyToolManifest>,
  exposure: ResolvedToolExposure,
): ReadonlySet<string> {
  const enabledToolAllowlist =
    exposure.enabledTools.length > 0 ? new Set(exposure.enabledTools) : null;

  const exposed = new Set<string>();
  for (const manifest of manifests) {
    if (!exposure.enabledToolPacks.has(manifest.pack as ToolPack)) {
      continue;
    }
    if (exposure.disabledTools.has(manifest.name)) {
      continue;
    }
    if (enabledToolAllowlist && !enabledToolAllowlist.has(manifest.name)) {
      continue;
    }
    if (manifest.safety.riskLevel !== (exposure.maxRiskLevel as ToolRiskLevel)) {
      continue;
    }
    exposed.add(manifest.name);
  }

  return exposed;
}
