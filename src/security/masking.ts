import { redactSensitiveText } from "./redaction.js";

const ARN_PATTERN = /arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{0,12}:[^\s,;]+/gi;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s()-]{7,}$/;

export function maskArn(value: string): string {
  if (!value) return "";
  return value.replace(ARN_PATTERN, "[REDACTED_ARN]");
}

export function maskEmailAddress(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return "";
  const at = trimmed.indexOf("@");
  if (at <= 0) return "[REDACTED_EMAIL]";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const maskedLocal = local.length <= 1 ? "*" : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

export function maskSubscriptionEndpoint(endpoint: string, protocol?: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return "";

  const normalizedProtocol = protocol?.toLowerCase() ?? "";
  if (normalizedProtocol === "email" || normalizedProtocol === "email-json" || EMAIL_PATTERN.test(trimmed)) {
    return maskEmailAddress(trimmed);
  }

  if (normalizedProtocol === "sms" || normalizedProtocol === "sms-sandbox" || PHONE_PATTERN.test(trimmed)) {
    if (trimmed.length <= 4) return "****";
    return `${"*".repeat(Math.max(4, trimmed.length - 4))}${trimmed.slice(-4)}`;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return redactSensitiveText(trimmed).replace(ARN_PATTERN, "[REDACTED_ARN]");
  }

  return maskArn(redactSensitiveText(trimmed));
}

export type TopicPolicySummary = {
  statementCount: number;
  allowsPublish: boolean;
  principalTypes: string[];
};

export function summarizeTopicPolicy(policyJson: string | undefined): TopicPolicySummary | undefined {
  if (!policyJson) return undefined;

  try {
    const policy = JSON.parse(policyJson) as {
      Statement?: Array<{
        Effect?: string;
        Action?: string | string[];
        Principal?: Record<string, unknown> | string;
      }>;
    };
    const statements = policy.Statement ?? [];
    const principalTypes = new Set<string>();
    let allowsPublish = false;

    for (const statement of statements) {
      const actions = Array.isArray(statement.Action)
        ? statement.Action
        : statement.Action
          ? [statement.Action]
          : [];
      if (actions.some((action) => action.includes("Publish") || action === "sns:*" || action === "*")) {
        allowsPublish = true;
      }

      const principal = statement.Principal;
      if (typeof principal === "string") {
        principalTypes.add(principal === "*" ? "wildcard" : "account");
      } else if (principal && typeof principal === "object") {
        for (const key of Object.keys(principal)) {
          principalTypes.add(key === "AWS" ? "aws" : key.toLowerCase());
        }
      }
    }

    return {
      statementCount: statements.length,
      allowsPublish,
      principalTypes: [...principalTypes].sort(),
    };
  } catch {
    return undefined;
  }
}
