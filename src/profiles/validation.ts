import type { CredentialRequest } from "../aws/credentials/types.js";
import { isValidRoleArn } from "../aws/credentials/helpers.js";
import {
  APP_PROFILE_ALIAS_MAX_LENGTH,
  APP_PROFILE_CAPABILITY_MAX_LENGTH,
  APP_PROFILE_DISPLAY_NAME_MAX_LENGTH,
  APP_PROFILE_ENVIRONMENT_MAX_LENGTH,
  APP_PROFILE_EXTERNAL_ID_MAX_LENGTH,
  APP_PROFILE_MAX_ALIASES,
  APP_PROFILE_MAX_BUCKETS,
  APP_PROFILE_MAX_CAPABILITIES,
  APP_PROFILE_MAX_CONTAINERS,
  APP_PROFILE_MAX_COUNT,
  APP_PROFILE_MAX_JSON_BYTES,
  APP_PROFILE_RESOURCE_NAME_MAX_LENGTH,
  APP_PROFILE_SESSION_NAME_MAX_LENGTH,
  BUDGET_ACCOUNT_ID_LENGTH,
  BUDGET_NAME_MAX_LENGTH,
  EVENTBRIDGE_RULE_PREFIX_MAX_LENGTH,
  EVENTBRIDGE_SCHEDULE_PREFIX_MAX_LENGTH,
  RDS_DB_INSTANCE_ID_MAX_LENGTH,
  SES_CONFIGURATION_SET_NAME_MAX_LENGTH,
  SNS_TOPIC_ARN_MAX_LENGTH,
  SNS_TOPIC_NAME_MAX_LENGTH,
  SSM_MAX_REQUIRED_PARAMETER_NAMES,
  SSM_PARAMETER_NAME_MAX_LENGTH,
  SSM_PARAMETER_PREFIX_MAX_LENGTH,
} from "../security/limits.js";
import { ValidationError } from "../security/errors.js";
import { validateRegion } from "../security/regions.js";
import type {
  ProfileIndex,
  ProfileResources,
  SafeProfileIndexEntry,
  ValidatedAppProfile,
} from "./types.js";

export const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-_]{1,62}$/;

const CONNECTION_STRING_PATTERN =
  /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\//i;
const KEY_VALUE_SECRET_PATTERN =
  /\b(?:password|secret|token|api[_-]?key)\s*=/i;
const PEM_BLOCK_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const LONG_BASE64_PATTERN = /^[A-Za-z0-9+/]{40,}={0,2}$/;
const AWS_ACCESS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/;
const AWS_SECRET_KEY_PATTERN = /\bAWS_SECRET_ACCESS_KEY\b/i;
const AWS_SESSION_TOKEN_PATTERN = /\bAWS_SESSION_TOKEN\b/i;
const DATABASE_URL_PATTERN = /\bDATABASE_URL\b/i;
const JWT_SECRET_PATTERN = /\bJWT_SECRET\b/i;
const BEARER_TOKEN_PATTERN = /\bbearer\s+[a-z0-9._-]+/i;

const KNOWN_RESOURCE_BLOCKS = [
  "ecs",
  "rds",
  "ses",
  "s3",
  "ssm",
  "ecr",
  "sns",
  "eventbridge",
  "budget",
] as const;

type KnownResourceBlock = (typeof KNOWN_RESOURCE_BLOCKS)[number];

export function validateProfileId(profileId: string): string {
  const trimmed = profileId?.trim() ?? "";
  if (!PROFILE_ID_PATTERN.test(trimmed)) {
    throw new ValidationError(
      "validation_error",
      "profileId must match /^[a-z0-9][a-z0-9-_]{1,62}$/.",
    );
  }
  return trimmed;
}

export function assertNoSecretLikeContent(value: string, fieldPath: string): void {
  if (CONNECTION_STRING_PATTERN.test(value)) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not look like a connection string.`,
    );
  }
  if (KEY_VALUE_SECRET_PATTERN.test(value)) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not contain secret-like key=value patterns.`,
    );
  }
  if (PEM_BLOCK_PATTERN.test(value)) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not contain private key material.`,
    );
  }
  if (LONG_BASE64_PATTERN.test(value.trim())) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not contain long base64-like strings.`,
    );
  }
  if (AWS_ACCESS_KEY_PATTERN.test(value)) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not contain AWS access key identifiers.`,
    );
  }
  if (AWS_SECRET_KEY_PATTERN.test(value)) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not reference AWS secret access keys.`,
    );
  }
  if (AWS_SESSION_TOKEN_PATTERN.test(value)) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not reference AWS session tokens.`,
    );
  }
  if (DATABASE_URL_PATTERN.test(value)) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not reference DATABASE_URL.`,
    );
  }
  if (JWT_SECRET_PATTERN.test(value)) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not reference JWT_SECRET.`,
    );
  }
  if (BEARER_TOKEN_PATTERN.test(value)) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not contain bearer tokens.`,
    );
  }
}

function validateStringField(
  value: unknown,
  fieldPath: string,
  maxLength: number,
  required = true,
): string {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) {
      return "";
    }
    throw new ValidationError("validation_error", `${fieldPath} must be a string.`);
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new ValidationError("validation_error", `${fieldPath} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not exceed ${maxLength} characters.`,
    );
  }
  if (trimmed.length > 0) {
    assertNoSecretLikeContent(trimmed, fieldPath);
  }
  return trimmed;
}

function validateAuthBlock(auth: unknown, fieldPath: string): CredentialRequest | undefined {
  if (auth === undefined || auth === null) {
    return undefined;
  }
  if (typeof auth !== "object" || Array.isArray(auth)) {
    throw new ValidationError("validation_error", `${fieldPath} must be an object.`);
  }

  const record = auth as Record<string, unknown>;
  const strategy = record.strategy;
  if (strategy === "default") {
    return { strategy: "default" };
  }
  if (strategy !== "assume-role") {
    throw new ValidationError(
      "validation_error",
      `${fieldPath}.strategy must be "default" or "assume-role".`,
    );
  }

  const roleArn = validateStringField(
    record.roleArn,
    `${fieldPath}.roleArn`,
    APP_PROFILE_RESOURCE_NAME_MAX_LENGTH,
  );
  if (!isValidRoleArn(roleArn)) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath}.roleArn must be a valid IAM role ARN.`,
    );
  }

  const externalId =
    record.externalId !== undefined
      ? validateStringField(
          record.externalId,
          `${fieldPath}.externalId`,
          APP_PROFILE_EXTERNAL_ID_MAX_LENGTH,
          false,
        )
      : undefined;
  const sessionName =
    record.sessionName !== undefined
      ? validateStringField(
          record.sessionName,
          `${fieldPath}.sessionName`,
          APP_PROFILE_SESSION_NAME_MAX_LENGTH,
          false,
        )
      : undefined;

  return {
    strategy: "assume-role",
    roleArn,
    ...(externalId ? { externalId } : {}),
    ...(sessionName ? { sessionName } : {}),
  };
}

function validateStringArray(
  value: unknown,
  fieldPath: string,
  maxItems: number,
  maxItemLength: number,
  required = false,
): string[] {
  if (value === undefined || value === null) {
    if (required) {
      throw new ValidationError("validation_error", `${fieldPath} is required.`);
    }
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ValidationError("validation_error", `${fieldPath} must be an array.`);
  }
  if (value.length > maxItems) {
    throw new ValidationError(
      "validation_error",
      `${fieldPath} must not exceed ${maxItems} items.`,
    );
  }
  return value.map((item, index) =>
    validateStringField(item, `${fieldPath}[${index}]`, maxItemLength),
  );
}

function validateEcsBlock(value: unknown): ProfileResources["ecs"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("validation_error", "resources.ecs must be an object.");
  }
  const record = value as Record<string, unknown>;
  const clusterName = validateStringField(
    record.clusterName,
    "resources.ecs.clusterName",
    APP_PROFILE_RESOURCE_NAME_MAX_LENGTH,
  );
  const serviceName = validateStringField(
    record.serviceName,
    "resources.ecs.serviceName",
    APP_PROFILE_RESOURCE_NAME_MAX_LENGTH,
  );
  const logGroupName =
    record.logGroupName !== undefined
      ? validateStringField(
          record.logGroupName,
          "resources.ecs.logGroupName",
          APP_PROFILE_RESOURCE_NAME_MAX_LENGTH,
          false,
        )
      : undefined;
  const containers = validateStringArray(
    record.containers,
    "resources.ecs.containers",
    APP_PROFILE_MAX_CONTAINERS,
    APP_PROFILE_RESOURCE_NAME_MAX_LENGTH,
  );

  return {
    clusterName,
    serviceName,
    ...(logGroupName ? { logGroupName } : {}),
    ...(containers.length > 0 ? { containers } : {}),
  };
}

function validateRdsBlock(value: unknown): ProfileResources["rds"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("validation_error", "resources.rds must be an object.");
  }
  const record = value as Record<string, unknown>;
  return {
    dbInstanceIdentifier: validateStringField(
      record.dbInstanceIdentifier,
      "resources.rds.dbInstanceIdentifier",
      RDS_DB_INSTANCE_ID_MAX_LENGTH,
    ),
  };
}

function validateSesBlock(value: unknown): ProfileResources["ses"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("validation_error", "resources.ses must be an object.");
  }
  const record = value as Record<string, unknown>;
  const auth = validateAuthBlock(record.auth, "resources.ses.auth");
  return {
    configurationSetName: validateStringField(
      record.configurationSetName,
      "resources.ses.configurationSetName",
      SES_CONFIGURATION_SET_NAME_MAX_LENGTH,
    ),
    ...(auth ? { auth } : {}),
  };
}

function validateS3Block(value: unknown): ProfileResources["s3"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("validation_error", "resources.s3 must be an object.");
  }
  const record = value as Record<string, unknown>;
  return {
    bucketName: validateStringField(
      record.bucketName,
      "resources.s3.bucketName",
      APP_PROFILE_RESOURCE_NAME_MAX_LENGTH,
    ),
  };
}

function validateSsmBlock(value: unknown): ProfileResources["ssm"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("validation_error", "resources.ssm must be an object.");
  }
  const record = value as Record<string, unknown>;
  const parameterPrefix = validateStringField(
    record.parameterPrefix,
    "resources.ssm.parameterPrefix",
    SSM_PARAMETER_PREFIX_MAX_LENGTH,
  );
  if (!parameterPrefix.startsWith("/")) {
    throw new ValidationError(
      "validation_error",
      "resources.ssm.parameterPrefix must start with '/'.",
    );
  }
  const requiredParameterNames = validateStringArray(
    record.requiredParameterNames,
    "resources.ssm.requiredParameterNames",
    SSM_MAX_REQUIRED_PARAMETER_NAMES,
    SSM_PARAMETER_NAME_MAX_LENGTH,
  );
  return {
    parameterPrefix,
    ...(requiredParameterNames.length > 0 ? { requiredParameterNames } : {}),
  };
}

function validateEcrBlock(value: unknown): ProfileResources["ecr"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("validation_error", "resources.ecr must be an object.");
  }
  const record = value as Record<string, unknown>;
  return {
    repositoryName: validateStringField(
      record.repositoryName,
      "resources.ecr.repositoryName",
      APP_PROFILE_RESOURCE_NAME_MAX_LENGTH,
    ),
  };
}

function validateSnsBlock(value: unknown): ProfileResources["sns"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("validation_error", "resources.sns must be an object.");
  }
  const record = value as Record<string, unknown>;
  const topicName =
    record.topicName !== undefined
      ? validateStringField(
          record.topicName,
          "resources.sns.topicName",
          SNS_TOPIC_NAME_MAX_LENGTH,
          false,
        )
      : "";
  const topicArn =
    record.topicArn !== undefined
      ? validateStringField(
          record.topicArn,
          "resources.sns.topicArn",
          SNS_TOPIC_ARN_MAX_LENGTH,
          false,
        )
      : "";
  if (!topicName && !topicArn) {
    throw new ValidationError(
      "validation_error",
      "resources.sns must include topicName or topicArn.",
    );
  }
  if (topicName && topicArn) {
    throw new ValidationError(
      "validation_error",
      "resources.sns must include topicName or topicArn, not both.",
    );
  }
  return {
    ...(topicName ? { topicName } : {}),
    ...(topicArn ? { topicArn } : {}),
  };
}

function validateEventBridgeBlock(value: unknown): ProfileResources["eventbridge"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(
      "validation_error",
      "resources.eventbridge must be an object.",
    );
  }
  const record = value as Record<string, unknown>;
  const ruleNamePrefix =
    record.ruleNamePrefix !== undefined
      ? validateStringField(
          record.ruleNamePrefix,
          "resources.eventbridge.ruleNamePrefix",
          EVENTBRIDGE_RULE_PREFIX_MAX_LENGTH,
          false,
        )
      : "";
  const scheduleNamePrefix =
    record.scheduleNamePrefix !== undefined
      ? validateStringField(
          record.scheduleNamePrefix,
          "resources.eventbridge.scheduleNamePrefix",
          EVENTBRIDGE_SCHEDULE_PREFIX_MAX_LENGTH,
          false,
        )
      : "";
  if (!ruleNamePrefix && !scheduleNamePrefix) {
    throw new ValidationError(
      "validation_error",
      "resources.eventbridge must include ruleNamePrefix or scheduleNamePrefix.",
    );
  }
  return {
    ...(ruleNamePrefix ? { ruleNamePrefix } : {}),
    ...(scheduleNamePrefix ? { scheduleNamePrefix } : {}),
  };
}

function validateBudgetBlock(value: unknown): ProfileResources["budget"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("validation_error", "resources.budget must be an object.");
  }
  const record = value as Record<string, unknown>;
  const budgetName = validateStringField(
    record.budgetName,
    "resources.budget.budgetName",
    BUDGET_NAME_MAX_LENGTH,
  );
  const accountId =
    record.accountId !== undefined
      ? validateStringField(
          record.accountId,
          "resources.budget.accountId",
          BUDGET_ACCOUNT_ID_LENGTH,
          false,
        )
      : "";
  if (accountId && !/^\d{12}$/.test(accountId)) {
    throw new ValidationError(
      "validation_error",
      `resources.budget.accountId must be a ${BUDGET_ACCOUNT_ID_LENGTH}-digit AWS account ID.`,
    );
  }
  return {
    budgetName,
    ...(accountId ? { accountId } : {}),
  };
}

const RESOURCE_BLOCK_VALIDATORS: Record<
  KnownResourceBlock,
  (value: unknown) => ProfileResources[KnownResourceBlock]
> = {
  ecs: validateEcsBlock,
  rds: validateRdsBlock,
  ses: validateSesBlock,
  s3: validateS3Block,
  ssm: validateSsmBlock,
  ecr: validateEcrBlock,
  sns: validateSnsBlock,
  eventbridge: validateEventBridgeBlock,
  budget: validateBudgetBlock,
};

function validateResources(value: unknown): ProfileResources {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("validation_error", "resources must be an object.");
  }

  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) => !KNOWN_RESOURCE_BLOCKS.includes(key as KnownResourceBlock),
  );
  if (unknownKeys.length > 0) {
    throw new ValidationError(
      "validation_error",
      `resources contains unknown block(s): ${unknownKeys.join(", ")}.`,
    );
  }

  const resources: ProfileResources = {};
  for (const blockName of KNOWN_RESOURCE_BLOCKS) {
    const blockValue = record[blockName];
    if (blockValue === undefined || blockValue === null) {
      continue;
    }
    const validated = RESOURCE_BLOCK_VALIDATORS[blockName](blockValue);
    switch (blockName) {
      case "ecs":
        resources.ecs = validated as ProfileResources["ecs"];
        break;
      case "rds":
        resources.rds = validated as ProfileResources["rds"];
        break;
      case "ses":
        resources.ses = validated as ProfileResources["ses"];
        break;
      case "s3":
        resources.s3 = validated as ProfileResources["s3"];
        break;
      case "ssm":
        resources.ssm = validated as ProfileResources["ssm"];
        break;
      case "ecr":
        resources.ecr = validated as ProfileResources["ecr"];
        break;
      case "sns":
        resources.sns = validated as ProfileResources["sns"];
        break;
      case "eventbridge":
        resources.eventbridge = validated as ProfileResources["eventbridge"];
        break;
      case "budget":
        resources.budget = validated as ProfileResources["budget"];
        break;
    }
  }

  if (Object.keys(resources).length === 0) {
    throw new ValidationError(
      "validation_error",
      "Profile must include at least one known resource block.",
    );
  }

  const bucketBlocks = resources.s3 ? 1 : 0;
  if (bucketBlocks > APP_PROFILE_MAX_BUCKETS) {
    throw new ValidationError(
      "validation_error",
      `Profile must not exceed ${APP_PROFILE_MAX_BUCKETS} S3 bucket block(s).`,
    );
  }

  return resources;
}

function validateIndexEntry(value: unknown, allowedRegions: string[]): SafeProfileIndexEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("validation_error", "Profile index entry must be an object.");
  }
  const record = value as Record<string, unknown>;
  const id = validateProfileId(String(record.id ?? ""));
  const displayName = validateStringField(
    record.displayName,
    "displayName",
    APP_PROFILE_DISPLAY_NAME_MAX_LENGTH,
  );
  const environment = validateStringField(
    record.environment,
    "environment",
    APP_PROFILE_ENVIRONMENT_MAX_LENGTH,
  );
  const region = validateStringField(record.region, "region", APP_PROFILE_RESOURCE_NAME_MAX_LENGTH);
  validateRegion(region, allowedRegions);

  if (typeof record.enabled !== "boolean") {
    throw new ValidationError("validation_error", "enabled must be a boolean.");
  }

  const aliases = validateStringArray(
    record.aliases,
    "aliases",
    APP_PROFILE_MAX_ALIASES,
    APP_PROFILE_ALIAS_MAX_LENGTH,
  );
  const capabilities = validateStringArray(
    record.capabilities,
    "capabilities",
    APP_PROFILE_MAX_CAPABILITIES,
    APP_PROFILE_CAPABILITY_MAX_LENGTH,
  );

  return {
    id,
    displayName,
    environment,
    region,
    enabled: record.enabled,
    aliases,
    capabilities,
  };
}

export function validateProfileIndexDocument(
  raw: unknown,
  allowedRegions: string[],
  jsonBytes?: number,
): ProfileIndex {
  if (jsonBytes !== undefined && jsonBytes > APP_PROFILE_MAX_JSON_BYTES) {
    throw new ValidationError(
      "validation_error",
      `Profile index exceeds maximum size of ${APP_PROFILE_MAX_JSON_BYTES} bytes.`,
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ValidationError("validation_error", "Profile index must be an object.");
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== 1) {
    throw new ValidationError("validation_error", "Profile index version must be 1.");
  }
  if (!Array.isArray(record.profiles)) {
    throw new ValidationError("validation_error", "Profile index profiles must be an array.");
  }
  if (record.profiles.length > APP_PROFILE_MAX_COUNT) {
    throw new ValidationError(
      "validation_error",
      `Profile index must not exceed ${APP_PROFILE_MAX_COUNT} profiles.`,
    );
  }

  const profiles = record.profiles.map((entry) => validateIndexEntry(entry, allowedRegions));
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (ids.has(profile.id)) {
      throw new ValidationError(
        "validation_error",
        `Duplicate profile id in index: ${profile.id}.`,
      );
    }
    ids.add(profile.id);
  }

  return { version: 1, profiles };
}

export function validateProfileDocument(
  raw: unknown,
  profileId: string,
  allowedRegions: string[],
  jsonBytes?: number,
): ValidatedAppProfile {
  const safeProfileId = validateProfileId(profileId);
  if (jsonBytes !== undefined && jsonBytes > APP_PROFILE_MAX_JSON_BYTES) {
    throw new ValidationError(
      "validation_error",
      `Profile exceeds maximum size of ${APP_PROFILE_MAX_JSON_BYTES} bytes.`,
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ValidationError("validation_error", "Profile must be an object.");
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== 1) {
    throw new ValidationError("validation_error", "Profile version must be 1.");
  }

  const id = validateProfileId(String(record.id ?? ""));
  if (id !== safeProfileId) {
    throw new ValidationError(
      "validation_error",
      "Profile id must match the requested profileId and KV key.",
    );
  }

  const displayName = validateStringField(
    record.displayName,
    "displayName",
    APP_PROFILE_DISPLAY_NAME_MAX_LENGTH,
  );
  const environment = validateStringField(
    record.environment,
    "environment",
    APP_PROFILE_ENVIRONMENT_MAX_LENGTH,
  );
  const region = validateStringField(record.region, "region", APP_PROFILE_RESOURCE_NAME_MAX_LENGTH);
  validateRegion(region, allowedRegions);

  const auth = validateAuthBlock(record.auth, "auth");
  const resources = validateResources(record.resources);

  return {
    version: 1,
    id,
    displayName,
    environment,
    region,
    ...(auth ? { auth } : {}),
    resources,
  };
}

export function resolveProfileAuth(auth: CredentialRequest | undefined): CredentialRequest {
  return auth ?? { strategy: "default" };
}
