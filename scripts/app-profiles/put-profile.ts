#!/usr/bin/env node
import { parsePutArgs } from "./lib/cli-args.js";
import { loadAppProfileCliConfig } from "./lib/wrangler-config.js";
import { createKvStoreForCli, putProfileToKv } from "./profile-service.js";

async function main(): Promise<void> {
  const options = parsePutArgs(process.argv.slice(2));
  const cliConfig = loadAppProfileCliConfig(options.configPath);
  const kv = createKvStoreForCli(options, cliConfig);
  const result = await putProfileToKv(kv, cliConfig, options.filePath);

  console.log(
    [
      "Profile uploaded.",
      `profileId: ${result.profileId}`,
      `profileKey: ${result.profileKey}`,
      `indexKey: ${result.indexKey}`,
      `indexEntries: ${result.indexEntryCount}`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Profile upload failed.";
  console.error(message);
  process.exit(1);
});
