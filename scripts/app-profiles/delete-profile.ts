#!/usr/bin/env node
import { parseDeleteArgs } from "./lib/cli-args.js";
import { loadAppProfileCliConfig } from "./lib/wrangler-config.js";
import { createKvStoreForCli, deleteProfileFromKv } from "./profile-service.js";

async function main(): Promise<void> {
  const options = parseDeleteArgs(process.argv.slice(2));
  const cliConfig = loadAppProfileCliConfig(options.configPath);
  const kv = createKvStoreForCli(options, cliConfig);
  const result = await deleteProfileFromKv(kv, cliConfig, options.profileId, options.yes);

  if (!result.confirmed) {
    console.error(result.preview);
    process.exit(1);
  }

  console.log(
    [
      "Profile deleted.",
      `profileId: ${result.profileId}`,
      `profileKey: ${result.profileKey}`,
      `indexKey: ${result.indexKey}`,
      `indexEntries: ${result.indexEntryCount}`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Profile delete failed.";
  console.error(message);
  process.exit(1);
});
