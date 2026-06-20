import { XMLParser } from "fast-xml-parser";
import type { Ec2DescribeInstancesResponse } from "./ec2-types.js";

const parser = new XMLParser({
  ignoreAttributes: true,
  isArray: (name) => name === "item",
  trimValues: true,
  parseTagValue: false,
});

export function parseEc2Response(text: string): Ec2DescribeInstancesResponse {
  const result = parser.parse(text) as Ec2DescribeInstancesResponse;

  if (
    !result ||
    typeof result !== "object" ||
    !result.DescribeInstancesResponse
  ) {
    return {} as Ec2DescribeInstancesResponse;
  }

  return result;
}
