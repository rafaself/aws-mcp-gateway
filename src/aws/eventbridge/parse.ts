import { maskArn } from "../../security/masking.js";
import type {
  EventBridgeListTargetsByRuleResponse,
  EventBridgeRuleSummary,
  EventBridgeRulesStatusResult,
  SchedulerGetScheduleResponse,
  SchedulerScheduleSummary,
} from "./types.js";

function summarizeEventPattern(eventPattern: string | undefined): string | undefined {
  if (!eventPattern) return undefined;
  try {
    const parsed = JSON.parse(eventPattern) as Record<string, unknown>;
    const sources = parsed.source;
    const detailTypes = parsed["detail-type"];
    const parts: string[] = [];
    if (Array.isArray(sources)) {
      parts.push(`sources=${sources.length}`);
    }
    if (Array.isArray(detailTypes)) {
      parts.push(`detailTypes=${detailTypes.length}`);
    }
    return parts.length > 0 ? parts.join(", ") : "custom-pattern";
  } catch {
    return "custom-pattern";
  }
}

export function normalizeTargets(
  response: EventBridgeListTargetsByRuleResponse,
): EventBridgeRuleSummary["targets"] {
  return (response.Targets ?? []).map((target) => ({
    ...(target.Id ? { id: target.Id } : {}),
    ...(target.Arn ? { arn: maskArn(target.Arn) } : {}),
    ...(target.RoleArn ? { roleArn: maskArn(target.RoleArn) } : {}),
  }));
}

export function normalizeRule(
  rule: {
    Name?: string;
    State?: string;
    ScheduleExpression?: string;
    EventPattern?: string;
  },
  targets: EventBridgeRuleSummary["targets"],
): EventBridgeRuleSummary {
  return {
    name: rule.Name ?? "unknown",
    state: rule.State ?? "UNKNOWN",
    ...(rule.ScheduleExpression ? { scheduleExpression: rule.ScheduleExpression } : {}),
    ...(rule.EventPattern
      ? { eventPatternSummary: summarizeEventPattern(rule.EventPattern) }
      : {}),
    targetCount: targets.length,
    targets,
  };
}

export function normalizeSchedule(
  schedule: SchedulerGetScheduleResponse,
): SchedulerScheduleSummary {
  return {
    name: schedule.Name ?? "unknown",
    state: schedule.State ?? "UNKNOWN",
    ...(schedule.ScheduleExpression
      ? { scheduleExpression: schedule.ScheduleExpression }
      : {}),
    ...(schedule.Target?.Arn ? { targetArn: maskArn(schedule.Target.Arn) } : {}),
    ...(schedule.Target?.RoleArn
      ? { targetRoleArn: maskArn(schedule.Target.RoleArn) }
      : {}),
  };
}

export function buildRulesStatusResult(
  region: string,
  rules: EventBridgeRuleSummary[],
  schedules: SchedulerScheduleSummary[],
  truncated: boolean,
): EventBridgeRulesStatusResult {
  return { region, rules, schedules, truncated };
}
