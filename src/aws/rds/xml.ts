import { XMLParser } from "fast-xml-parser";
import type {
  RdsDescribeDbInstancesResponse,
  RdsDescribeDbSubnetGroupsResponse,
} from "./types.js";

const parser = new XMLParser({
  ignoreAttributes: true,
  isArray: (name) => name === "item" || name === "DBInstance",
  trimValues: true,
  parseTagValue: false,
});

export function parseRdsResponse<T>(text: string): T {
  const result = parser.parse(text) as T;
  if (!result || typeof result !== "object") {
    return {} as T;
  }
  return result;
}

export function parseDescribeDbInstancesResponse(
  text: string,
): RdsDescribeDbInstancesResponse {
  return parseRdsResponse<RdsDescribeDbInstancesResponse>(text);
}

export function parseDescribeDbSubnetGroupsResponse(
  text: string,
): RdsDescribeDbSubnetGroupsResponse {
  return parseRdsResponse<RdsDescribeDbSubnetGroupsResponse>(text);
}
