import type { CredentialRequest } from "../aws/credentials/types.js";

export type ProfileAuthConfig = CredentialRequest;

export type EcsResourceBlock = {
  clusterName: string;
  serviceName: string;
  logGroupName?: string;
  containers?: string[];
};

export type RdsResourceBlock = {
  dbInstanceIdentifier: string;
};

export type SesResourceBlock = {
  configurationSetName: string;
  auth?: ProfileAuthConfig;
};

export type S3ResourceBlock = {
  bucketName: string;
};

export type SsmResourceBlock = {
  parameterPrefix: string;
  requiredParameterNames?: string[];
};

export type EcrResourceBlock = {
  repositoryName: string;
};

export type SnsResourceBlock = {
  topicName?: string;
  topicArn?: string;
};

export type EventBridgeResourceBlock = {
  ruleNamePrefix?: string;
  scheduleNamePrefix?: string;
};

export type BudgetResourceBlock = {
  budgetName: string;
  accountId?: string;
};

export type ProfileResources = {
  ecs?: EcsResourceBlock;
  rds?: RdsResourceBlock;
  ses?: SesResourceBlock;
  s3?: S3ResourceBlock;
  ssm?: SsmResourceBlock;
  ecr?: EcrResourceBlock;
  sns?: SnsResourceBlock;
  eventbridge?: EventBridgeResourceBlock;
  budget?: BudgetResourceBlock;
};

export type SafeProfileIndexEntry = {
  id: string;
  displayName: string;
  environment: string;
  region: string;
  enabled: boolean;
  aliases: string[];
  capabilities: string[];
};

export type ProfileIndex = {
  version: 1;
  profiles: SafeProfileIndexEntry[];
};

export type ValidatedAppProfile = {
  version: 1;
  id: string;
  displayName: string;
  environment: string;
  region: string;
  auth?: ProfileAuthConfig;
  resources: ProfileResources;
};

export type ProfileStoreStatus = "disabled" | "available" | "unavailable" | "invalid";

export type ListApplicationProfilesResult = {
  status: ProfileStoreStatus;
  profiles: SafeProfileIndexEntry[];
  error?: string;
};
