import type { RdsInstanceHealth, RdsRawDbInstance } from "./types.js";

function parseBoolean(value: string | undefined): boolean {
  return value === "true";
}

function parseInteger(value: string | undefined, fallback = 0): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function extractDbInstances(
  response: {
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
  },
): RdsRawDbInstance[] {
  const root = response.DescribeDBInstancesResponse;
  const instances =
    root?.DescribeDBInstancesResult?.DBInstances?.DBInstance ??
    root?.DBInstances?.DBInstance;
  return asArray(instances);
}

export function extractDbSubnetGroups(
  response: {
    DescribeDBSubnetGroupsResponse?: {
      DescribeDBSubnetGroupsResult?: {
        DBSubnetGroups?: {
          DBSubnetGroup?: { DBSubnetGroupName?: string; VpcId?: string } | Array<{
            DBSubnetGroupName?: string;
            VpcId?: string;
          }>;
        };
      };
      DBSubnetGroups?: {
        DBSubnetGroup?: { DBSubnetGroupName?: string; VpcId?: string } | Array<{
          DBSubnetGroupName?: string;
          VpcId?: string;
        }>;
      };
    };
  },
): Array<{ DBSubnetGroupName?: string; VpcId?: string }> {
  const root = response.DescribeDBSubnetGroupsResponse;
  const groups =
    root?.DescribeDBSubnetGroupsResult?.DBSubnetGroups?.DBSubnetGroup ??
    root?.DBSubnetGroups?.DBSubnetGroup;
  return asArray(groups);
}

export function normalizeInstanceHealth(
  raw: RdsRawDbInstance,
  region: string,
  network?: { dbSubnetGroupName?: string; vpcId?: string },
): RdsInstanceHealth {
  const health: RdsInstanceHealth = {
    dbInstanceIdentifier: raw.DBInstanceIdentifier ?? "unknown",
    region,
    status: raw.DBInstanceStatus ?? "unknown",
    engine: raw.Engine ?? "unknown",
    engineVersion: raw.EngineVersion ?? "unknown",
    instanceClass: raw.DBInstanceClass ?? "unknown",
    allocatedStorageGb: parseInteger(raw.AllocatedStorage),
    storageEncrypted: parseBoolean(raw.StorageEncrypted),
    publiclyAccessible: parseBoolean(raw.PubliclyAccessible),
    multiAz: parseBoolean(raw.MultiAZ),
    backupRetentionPeriodDays: parseInteger(raw.BackupRetentionPeriod),
    deletionProtection: parseBoolean(raw.DeletionProtection),
  };

  const maxAllocated = parseInteger(raw.MaxAllocatedStorage, -1);
  if (maxAllocated >= 0) {
    health.maxAllocatedStorageGb = maxAllocated;
  }

  if (raw.LatestRestorableTime) {
    health.latestRestorableTime = raw.LatestRestorableTime;
  }

  const subnetGroupName =
    network?.dbSubnetGroupName ?? raw.DBSubnetGroup?.DBSubnetGroupName;
  if (subnetGroupName) {
    health.dbSubnetGroupName = subnetGroupName;
  }

  if (network?.vpcId) {
    health.vpcId = network.vpcId;
  }

  return health;
}
