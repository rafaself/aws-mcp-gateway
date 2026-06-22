import { describe, expect, it } from "vitest";
import committedMatrix from "../../../docs/aws-capability-matrix.md?raw";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { renderAwsCapabilityMatrixMarkdown } from "./capability-matrix.js";
import { createToolManifests } from "./registry.js";

describe("aws capability matrix document", () => {
  const manifests = createToolManifests(createTestGatewayContext());

  it("matches the committed capability matrix markdown", () => {
    const rendered = renderAwsCapabilityMatrixMarkdown(manifests);
    expect(rendered).toBe(committedMatrix);
  });
});
