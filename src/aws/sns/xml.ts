import { XMLParser } from "fast-xml-parser";
import type {
  SnsGetTopicAttributesResponse,
  SnsListSubscriptionsByTopicResponse,
  SnsListTopicsResponse,
} from "./types.js";

const parser = new XMLParser({
  ignoreAttributes: true,
  isArray: (name) => name === "member" || name === "entry",
  trimValues: true,
  parseTagValue: false,
});

export function parseSnsResponse<T>(text: string): T {
  const result = parser.parse(text) as T;
  if (!result || typeof result !== "object") {
    return {} as T;
  }
  return result;
}

export function parseListTopicsResponse(text: string): SnsListTopicsResponse {
  return parseSnsResponse<SnsListTopicsResponse>(text);
}

export function parseGetTopicAttributesResponse(text: string): SnsGetTopicAttributesResponse {
  return parseSnsResponse<SnsGetTopicAttributesResponse>(text);
}

export function parseListSubscriptionsByTopicResponse(
  text: string,
): SnsListSubscriptionsByTopicResponse {
  return parseSnsResponse<SnsListSubscriptionsByTopicResponse>(text);
}

export function extractErrorCode(text: string): string | undefined {
  const match = text.match(/<Code>([^<]+)<\/Code>/);
  return match?.[1];
}
