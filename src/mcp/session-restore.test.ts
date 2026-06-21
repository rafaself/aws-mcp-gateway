import { describe, expect, it } from "vitest";
import { shouldUseSessionManagement } from "./session-restore.js";

describe("shouldUseSessionManagement", () => {
  it("enables sessions for initialize requests", () => {
    expect(
      shouldUseSessionManagement(
        new Request("https://gateway.example.com/mcp", { method: "POST" }),
        true,
      ),
    ).toBe(true);
  });

  it("enables sessions when mcp-session-id is present", () => {
    expect(
      shouldUseSessionManagement(
        new Request("https://gateway.example.com/mcp", {
          method: "GET",
          headers: { "mcp-session-id": "session-123" },
        }),
        false,
      ),
    ).toBe(true);
  });

  it("disables sessions for stateless follow-up requests", () => {
    expect(
      shouldUseSessionManagement(
        new Request("https://gateway.example.com/mcp", { method: "POST" }),
        false,
      ),
    ).toBe(false);
  });
});
