#!/usr/bin/env node
import { parseValidateArgs } from "./lib/cli-args.js";
import { loadAppProfileCliConfig } from "./lib/wrangler-config.js";
import {
  buildProfileValidationSummary,
  formatProfileValidationSummary,
} from "./lib/profile-output.js";
import { validateProfileFromFile } from "./profile-service.js";

async function main(): Promise<void> {
  const options = parseValidateArgs(process.argv.slice(2));
  const cliConfig = loadAppProfileCliConfig(options.configPath);
  const profile = await validateProfileFromFile(
    options.filePath,
    cliConfig.allowedRegions,
    options.profileId,
  );
  const summary = buildProfileValidationSummary(profile);
  console.log(formatProfileValidationSummary(summary));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Profile validation failed.";
  console.error(message);
  process.exit(1);
});
