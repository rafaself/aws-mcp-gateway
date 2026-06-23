import {
  SNS_TOPIC_ARN_MAX_LENGTH,
  SNS_TOPIC_NAME_MAX_LENGTH,
} from "../../security/limits.js";
import { ValidationError } from "../../security/errors.js";

const TOPIC_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const TOPIC_ARN_PATTERN =
  /^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]+$/;

export type SnsTopicInput = {
  topicName?: string;
  topicArn?: string;
};

export function validateTopicInput(input: SnsTopicInput): {
  topicName?: string;
  topicArn?: string;
} {
  const topicName = input.topicName?.trim();
  const topicArn = input.topicArn?.trim();

  if (!topicName && !topicArn) {
    throw new ValidationError(
      "validation_error",
      "Either topicName or topicArn is required.",
    );
  }
  if (topicName && topicArn) {
    throw new ValidationError(
      "validation_error",
      "Provide topicName or topicArn, not both.",
    );
  }

  if (topicName) {
    if (topicName.length > SNS_TOPIC_NAME_MAX_LENGTH) {
      throw new ValidationError(
        "validation_error",
        `topicName must be at most ${SNS_TOPIC_NAME_MAX_LENGTH} characters.`,
      );
    }
    if (!TOPIC_NAME_PATTERN.test(topicName)) {
      throw new ValidationError("validation_error", "topicName contains invalid characters.");
    }
    return { topicName };
  }

  if (topicArn!.length > SNS_TOPIC_ARN_MAX_LENGTH) {
    throw new ValidationError(
      "validation_error",
      `topicArn must be at most ${SNS_TOPIC_ARN_MAX_LENGTH} characters.`,
    );
  }
  if (!TOPIC_ARN_PATTERN.test(topicArn!)) {
    throw new ValidationError("validation_error", "topicArn is not a valid SNS topic ARN.");
  }

  return { topicArn };
}

export function extractTopicNameFromArn(topicArn: string): string {
  const slash = topicArn.lastIndexOf(":");
  return slash >= 0 ? topicArn.slice(slash + 1) : topicArn;
}
