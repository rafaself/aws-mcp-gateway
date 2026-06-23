import { describe, expect, it } from "vitest";
import { parseAssumeRoleResponse } from "./parse.js";

const SUCCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleResult>
    <Credentials>
      <AccessKeyId>ASIAEXAMPLE</AccessKeyId>
      <SecretAccessKey>secret-example</SecretAccessKey>
      <SessionToken>session-token-example</SessionToken>
      <Expiration>2026-06-23T12:00:00Z</Expiration>
    </Credentials>
  </AssumeRoleResult>
</AssumeRoleResponse>`;

describe("parseAssumeRoleResponse", () => {
  it("parses assumed role credentials from XML", () => {
    const result = parseAssumeRoleResponse(SUCCESS_XML);

    expect(result).toEqual({
      accessKeyId: "ASIAEXAMPLE",
      secretAccessKey: "secret-example",
      sessionToken: "session-token-example",
      expiration: "2026-06-23T12:00:00Z",
    });
  });

  it("throws when credentials are missing", () => {
    expect(() => parseAssumeRoleResponse("<AssumeRoleResponse/>")).toThrow(
      "STS AssumeRole response missing credentials.",
    );
  });

  it("throws on STS error response without leaking details", () => {
    const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<ErrorResponse>
  <Error>
    <Code>AccessDenied</Code>
    <Message>User is not authorized</Message>
  </Error>
</ErrorResponse>`;

    expect(() => parseAssumeRoleResponse(errorXml)).toThrow("STS AssumeRole failed.");
  });
});
