import type { EnvironmentOverviewResult } from "./sections.js";

function formatSectionStatus(label: string, status: string, detail?: string): string {
  const base = `${label}: ${status}`;
  return detail ? `${base} — ${detail}` : base;
}

export function formatEnvironmentOverviewText(result: EnvironmentOverviewResult): string {
  const lines = [
    `Application overview for ${result.profile.displayName} (${result.profile.id}, ${result.profile.environment}, ${result.profile.region})`,
  ];

  const sections: Array<[string, { status: string; error?: string; configured: boolean }]> = [
    ["Compute", result.compute],
    ["Database", result.database],
    ["Logs", result.logs],
    ["SSM inventory", result.ssm],
    ["Artifacts", result.artifacts],
    ["S3 posture", result.s3],
    ["SES", result.ses],
    ["Alerting", result.alerting],
    ["Budget", result.budget],
  ];

  for (const [label, section] of sections) {
    if (!section.configured) {
      continue;
    }
    if (section.status === "error") {
      lines.push(formatSectionStatus(label, "error", section.error));
      continue;
    }
    lines.push(formatSectionStatus(label, "ok"));
  }

  return lines.join("\n");
}
