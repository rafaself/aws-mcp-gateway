import { describe, expect, it } from "vitest";
import { normalizeInstanceHealth } from "./parse.js";
import type { RdsRawDbInstance } from "./types.js";

const sampleInstance: RdsRawDbInstance = {
  DBInstanceIdentifier: "my-db",
  DBInstanceStatus: "available",
  Engine: "postgres",
  EngineVersion: "15.4",
  DBInstanceClass: "db.t3.micro",
  AllocatedStorage: "20",
  MaxAllocatedStorage: "100",
  StorageEncrypted: "true",
  PubliclyAccessible: "false",
  MultiAZ: "true",
  BackupRetentionPeriod: "7",
  DeletionProtection: "true",
  LatestRestorableTime: "2026-06-23T12:00:00.000Z",
  DBSubnetGroup: { DBSubnetGroupName: "default-vpc" },
  Endpoint: { Address: "my-db.abc123.us-east-1.rds.amazonaws.com", Port: "5432" },
  MasterUsername: "admin",
};

describe("normalizeInstanceHealth", () => {
  it("maps RDS status and storage fields", () => {
    const health = normalizeInstanceHealth(sampleInstance, "us-east-1", {
      dbSubnetGroupName: "default-vpc",
      vpcId: "vpc-12345",
    });

    expect(health).toMatchObject({
      dbInstanceIdentifier: "my-db",
      region: "us-east-1",
      status: "available",
      engine: "postgres",
      engineVersion: "15.4",
      instanceClass: "db.t3.micro",
      allocatedStorageGb: 20,
      maxAllocatedStorageGb: 100,
      storageEncrypted: true,
      publiclyAccessible: false,
      multiAz: true,
      backupRetentionPeriodDays: 7,
      deletionProtection: true,
      latestRestorableTime: "2026-06-23T12:00:00.000Z",
      dbSubnetGroupName: "default-vpc",
      vpcId: "vpc-12345",
    });
  });

  it("omits endpoint host, port, and credentials from output", () => {
    const health = normalizeInstanceHealth(sampleInstance, "us-east-1");
    const serialized = JSON.stringify(health);

    expect(health).not.toHaveProperty("endpoint");
    expect(health).not.toHaveProperty("masterUsername");
    expect(serialized).not.toContain("my-db.abc123");
    expect(serialized).not.toContain("admin");
    expect(serialized).not.toContain("5432");
  });
});
