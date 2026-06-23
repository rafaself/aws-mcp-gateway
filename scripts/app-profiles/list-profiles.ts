#!/usr/bin/env node
import { parseListArgs } from "./lib/cli-args.js";
import { loadAppProfileCliConfig } from "./lib/wrangler-config.js";
import { createKvStoreForCli, formatListedProfiles, listProfilesFromKv } from "./profile-service.js";

async function main(): Promise<void> {
  const options = parseListArgs(process.argv.slice(2));
  const cliConfig = loadAppProfileCliConfig(options.configPath);
  const kv = createKvStoreForCli(options, cliConfig);
  const index = await listProfilesFromKv(kv, cliConfig);
  console.log(formatListedProfiles(cliConfig, index));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Profile list failed.";
  console.error(message);
  process.exit(1);
});
