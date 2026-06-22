import {
  awsActionsForCapabilities,
  awsServicesForCapabilities,
  getAwsCapability,
  type AwsCapabilityId,
} from "../../aws/capabilities.js";
import type { AnyToolManifest } from "./manifest.js";
import { isAwsBackedManifest } from "./policy.js";

export type AwsCapabilityMatrixRow = {
  toolName: string;
  pack: string;
  awsService: string;
  awsAction: string;
  regionMode: string;
  riskLevel: string;
  cacheTtlSeconds: number;
  costClass: string;
  costSensitivity: string;
};

export function buildAwsCapabilityMatrixRows(
  manifests: ReadonlyArray<AnyToolManifest>,
): AwsCapabilityMatrixRow[] {
  const rows: AwsCapabilityMatrixRow[] = [];

  for (const manifest of manifests) {
    if (!isAwsBackedManifest(manifest)) {
      continue;
    }

    for (const capabilityId of manifest.aws.capabilities) {
      const capability = getAwsCapability(capabilityId);
      rows.push({
        toolName: manifest.name,
        pack: manifest.pack,
        awsService: capability.iamService,
        awsAction: capability.iamAction,
        regionMode: manifest.aws.regionMode,
        riskLevel: manifest.safety.riskLevel,
        cacheTtlSeconds: manifest.safety.cacheTtlSeconds,
        costClass: manifest.safety.costClass,
        costSensitivity: capability.costSensitivity,
      });
    }
  }

  return rows.sort((a, b) => {
    const toolCmp = a.toolName.localeCompare(b.toolName);
    if (toolCmp !== 0) return toolCmp;
    return a.awsAction.localeCompare(b.awsAction);
  });
}

export function renderAwsCapabilityMatrixMarkdown(
  manifests: ReadonlyArray<AnyToolManifest>,
): string {
  const rows = buildAwsCapabilityMatrixRows(manifests);
  const lines = [
    "# AWS capability matrix",
    "",
    "This document maps each AWS-backed MCP tool to declared capability IDs, IAM actions,",
    "region mode, risk level, and cost metadata. It is generated deterministically from",
    "tool manifests and the capability registry in `src/aws/capabilities.ts`.",
    "",
    "New AWS-backed tools must update capability metadata and regenerate this document",
    "before merge.",
    "",
    "| Tool | Pack | AWS service | AWS action | Region mode | Risk level | Cache TTL (s) | Cost class | Cost sensitivity |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.toolName} | ${row.pack} | ${row.awsService} | ${row.awsAction} | ${row.regionMode} | ${row.riskLevel} | ${row.cacheTtlSeconds} | ${row.costClass} | ${row.costSensitivity} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function manifestCapabilitiesAreConsistent(manifest: AnyToolManifest): boolean {
  if (!isAwsBackedManifest(manifest)) {
    return manifest.aws.capabilities.length === 0;
  }

  const declaredActions = [...manifest.aws.actions].sort();
  const derivedActions = awsActionsForCapabilities(manifest.aws.capabilities);
  const declaredServices = [...manifest.aws.services].sort();
  const derivedServices = awsServicesForCapabilities(manifest.aws.capabilities);

  return (
    declaredActions.length === derivedActions.length &&
    declaredActions.every((action, index) => action === derivedActions[index]) &&
    declaredServices.length === derivedServices.length &&
    declaredServices.every((service, index) => service === derivedServices[index])
  );
}

export function collectManifestCapabilityIds(
  manifests: ReadonlyArray<AnyToolManifest>,
): AwsCapabilityId[] {
  return manifests.flatMap((manifest) => manifest.aws.capabilities);
}
