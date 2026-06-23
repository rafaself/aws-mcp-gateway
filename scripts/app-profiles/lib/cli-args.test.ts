import { describe, expect, it } from "vitest";
import { parseDeleteArgs, parsePutArgs, parseValidateArgs } from "./cli-args.js";

describe("cli args", () => {
  it("parses validate args", () => {
    const options = parseValidateArgs([
      "--file",
      "examples/app-profiles/example-prod.profile.json",
      "--profile-id",
      "example-prod",
      "--remote",
      "-c",
      "wrangler.jsonc",
      "-e",
      "production",
    ]);

    expect(options.filePath).toBe("examples/app-profiles/example-prod.profile.json");
    expect(options.profileId).toBe("example-prod");
    expect(options.remote).toBe(true);
    expect(options.configPath).toBe("wrangler.jsonc");
    expect(options.env).toBe("production");
  });

  it("requires --file for put", () => {
    expect(() => parsePutArgs(["--remote"])).toThrow(/Missing required --file/);
  });

  it("parses delete args", () => {
    const options = parseDeleteArgs(["--profile-id", "example-prod", "--yes"]);
    expect(options.profileId).toBe("example-prod");
    expect(options.yes).toBe(true);
  });

  it("requires --profile-id for delete", () => {
    expect(() => parseDeleteArgs(["--yes"])).toThrow(/Missing required --profile-id/);
  });
});
