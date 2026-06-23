import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export interface RdsInstanceHealth {
  dbInstanceIdentifier: string;
  region: string;
  status: string;
  engine: string;
  engineVersion: string;
  instanceClass: string;
  allocatedStorageGb: number;
  maxAllocatedStorageGb?: number;
  storageEncrypted: boolean;
  publiclyAccessible: boolean;
  multiAz: boolean;
  backupRetentionPeriodDays: number;
  deletionProtection: boolean;
  latestRestorableTime?: string;
  dbSubnetGroupName?: string;
  vpcId?: string;
}

export interface RdsDescribeDbInstancesResponse {
  DescribeDBInstancesResponse?: {
    DescribeDBInstancesResult?: {
      DBInstances?: {
        DBInstance?: RdsRawDbInstance | RdsRawDbInstance[];
      };
    };
    DBInstances?: {
      DBInstance?: RdsRawDbInstance | RdsRawDbInstance[];
    };
  };
}

export interface RdsDescribeDbSubnetGroupsResponse {
  DescribeDBSubnetGroupsResponse?: {
    DescribeDBSubnetGroupsResult?: {
      DBSubnetGroups?: {
        DBSubnetGroup?: RdsRawDbSubnetGroup | RdsRawDbSubnetGroup[];
      };
    };
    DBSubnetGroups?: {
      DBSubnetGroup?: RdsRawDbSubnetGroup | RdsRawDbSubnetGroup[];
    };
  };
}

export interface RdsRawDbInstance {
  DBInstanceIdentifier?: string;
  DBInstanceStatus?: string;
  Engine?: string;
  EngineVersion?: string;
  DBInstanceClass?: string;
  AllocatedStorage?: string;
  MaxAllocatedStorage?: string;
  StorageEncrypted?: string;
  PubliclyAccessible?: string;
  MultiAZ?: string;
  BackupRetentionPeriod?: string;
  DeletionProtection?: string;
  LatestRestorableTime?: string;
  DBSubnetGroup?: {
    DBSubnetGroupName?: string;
  };
  Endpoint?: {
    Address?: string;
    Port?: string;
  };
  MasterUsername?: string;
}

export interface RdsRawDbSubnetGroup {
  DBSubnetGroupName?: string;
  VpcId?: string;
}

export class RdsError extends ValidationError {
  constructor(code: GatewayErrorCode, message: string) {
    super(code, message);
    this.name = "RdsError";
  }
}
