import type { AnyToolManifest } from "../tools/manifest.js";
import type { ToolExecutionMetadata } from "./metadata.js";
import { resolvePricingModel } from "./pricing.js";

const VISIBLE_BILLING_CACHE_STATUSES = new Set(["hit", "miss", "bypass"]);

export function shouldAppendVisibleBillingNote(manifest: AnyToolManifest): boolean {
  return (
    manifest.costControl.class === "paid" &&
    resolvePricingModel(manifest.costControl.class) === "per-request"
  );
}

export function formatVisibleBillingNote(
  execution: ToolExecutionMetadata,
): string | undefined {
  const { cache, billing } = execution;

  if (!VISIBLE_BILLING_CACHE_STATUSES.has(cache.status)) {
    return undefined;
  }

  if (cache.status === "hit") {
    return "Billing note: served from cache. No new AWS Cost Explorer API request was made.";
  }

  if (billing.charged && billing.estimatedCostUsd > 0) {
    const formattedCost = billing.estimatedCostUsd.toFixed(2);
    return `Billing note: served from AWS Cost Explorer, not cache. Estimated AWS API cost: US$ ${formattedCost}.`;
  }

  return undefined;
}

export function appendVisibleBillingNoteToContent(
  content: Array<{ type: string; text?: string }>,
  note: string,
): void {
  const firstTextBlock = content.find((block) => block.type === "text" && block.text !== undefined);
  if (!firstTextBlock?.text) {
    return;
  }

  firstTextBlock.text = `${firstTextBlock.text}\n\n${note}`;
}
