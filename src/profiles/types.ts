import type { CredentialRequest } from "../aws/credentials/types.js";

export type ProfileAuthConfig = CredentialRequest;

type ResourceBlockWithAuth<T> = T & { auth?: ProfileAuthConfig };

export type EcsResourceBlock = ResourceBlockWithAuth<{
  clusterName: string;
  serviceName: string;
  logGroupName?: string;
  containers?: string[];
}>;

export type RdsResourceBlock = ResourceBlockWithAuth<{
  dbInstanceIdentifier: string;
}>;

export type SesResourceBlock = ResourceBlockWithAuth<{
  configurationSetName: string;
}>;

export type S3ResourceBlock = ResourceBlockWithAuth<{
  bucketName: string;
}>;

export type SsmResourceBlock = ResourceBlockWithAuth<{
  parameterPrefix: string;
  requiredParameterNames?: string[];
}>;

export type EcrResourceBlock = ResourceBlockWithAuth<{
  repositoryName: string;
}>;

export type SnsResourceBlock = ResourceBlockWithAuth<{
  topicName?: string;
  topicArn?: string;
}>;

export type EventBridgeResourceBlock = ResourceBlockWithAuth<{
  ruleNamePrefix?: string;
  scheduleNamePrefix?: string;
}>;

export type BudgetResourceBlock = ResourceBlockWithAuth<{
  budgetName: string;
  accountId?: string;
}>;

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
