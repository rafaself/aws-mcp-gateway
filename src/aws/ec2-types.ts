import { ValidationError } from "../security/errors.js";

export type Ec2InstanceState =
  | "pending"
  | "running"
  | "stopping"
  | "stopped"
  | "terminated";

export const VALID_INSTANCE_STATES: readonly Ec2InstanceState[] = [
  "pending",
  "running",
  "stopping",
  "stopped",
  "terminated",
] as const;

export interface Ec2ListInstancesOptions {
  regions?: string[];
  stateFilter?: Ec2InstanceState;
}

export interface Ec2Instance {
  instanceId: string;
  region: string;
  state: string;
  instanceType: string;
  name: string;
  launchTime: string;
  availabilityZone: string;
  publicIpAddress?: string;
  privateIpAddress?: string;
}

export interface Ec2DescribeInstancesResponse {
  DescribeInstancesResponse?: {
    reservationSet?: {
      item?: Ec2RawReservation[];
    };
  };
}

export interface Ec2RawReservation {
  reservationId?: string;
  ownerId?: string;
  instancesSet?: {
    item?: Ec2RawInstance[];
  };
}

export interface Ec2RawInstance {
  instanceId?: string;
  instanceState?: { name?: string };
  instanceType?: string;
  launchTime?: string;
  placement?: { availabilityZone?: string };
  ipAddress?: string;
  privateIpAddress?: string;
  tagSet?: {
    item?: Array<{ key?: string; value?: string }>;
  };
}

export class Ec2Error extends ValidationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "Ec2Error";
  }
}
