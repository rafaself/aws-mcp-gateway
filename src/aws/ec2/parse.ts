import type { Ec2Instance, Ec2RawInstance } from "./types.js";

export function parseInstance(raw: Ec2RawInstance, region: string): Ec2Instance {
  const tags = raw.tagSet?.item ?? [];
  const nameTag = tags.find((t) => t.key === "Name");
  const instance: Ec2Instance = {
    instanceId: raw.instanceId ?? "unknown",
    region,
    state: raw.instanceState?.name ?? "unknown",
    instanceType: raw.instanceType ?? "unknown",
    name: nameTag?.value ?? "",
    launchTime: raw.launchTime ?? "",
    availabilityZone: raw.placement?.availabilityZone ?? "",
  };

  if (raw.ipAddress) {
    instance.publicIpAddress = raw.ipAddress;
  }

  if (raw.privateIpAddress) {
    instance.privateIpAddress = raw.privateIpAddress;
  }

  return instance;
}
