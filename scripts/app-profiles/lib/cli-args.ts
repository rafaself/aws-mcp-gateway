import { existsSync } from "node:fs";

export type CommonCliOptions = {
  configPath: string;
  env?: string;
  remote: boolean;
};

export type ValidateCliOptions = CommonCliOptions & {
  filePath: string;
  profileId?: string;
};

export type PutCliOptions = CommonCliOptions & {
  filePath: string;
};

export type DeleteCliOptions = CommonCliOptions & {
  profileId: string;
  yes: boolean;
};

function readFlagValue(argv: string[], index: number, flag: string): string | undefined {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function defaultWranglerConfigPath(): string {
  return existsSync("wrangler.deploy.jsonc") ? "wrangler.deploy.jsonc" : "wrangler.jsonc";
}

function parseCommonOptions(argv: string[]): CommonCliOptions {
  let configPath = defaultWranglerConfigPath();
  let env: string | undefined;
  let remote = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-c" || arg === "--config") {
      configPath = readFlagValue(argv, i, arg) ?? configPath;
      i++;
    } else if (arg === "-e" || arg === "--env") {
      env = readFlagValue(argv, i, arg);
      i++;
    } else if (arg === "--remote") {
      remote = true;
    }
  }

  return { configPath, env, remote };
}

export function parseValidateArgs(argv: string[]): ValidateCliOptions {
  const common = parseCommonOptions(argv);
  let filePath: string | undefined;
  let profileId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") {
      filePath = readFlagValue(argv, i, arg);
      i++;
    } else if (arg === "--profile-id") {
      profileId = readFlagValue(argv, i, arg);
      i++;
    }
  }

  if (!filePath) {
    throw new Error("Missing required --file <path> argument.");
  }

  return { ...common, filePath, profileId };
}

export function parsePutArgs(argv: string[]): PutCliOptions {
  const common = parseCommonOptions(argv);
  let filePath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") {
      filePath = readFlagValue(argv, i, arg);
      i++;
    }
  }

  if (!filePath) {
    throw new Error("Missing required --file <path> argument.");
  }

  return { ...common, filePath };
}

export function parseListArgs(argv: string[]): CommonCliOptions {
  return parseCommonOptions(argv);
}

export function parseDeleteArgs(argv: string[]): DeleteCliOptions {
  const common = parseCommonOptions(argv);
  let profileId: string | undefined;
  let yes = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--profile-id") {
      profileId = readFlagValue(argv, i, arg);
      i++;
    } else if (arg === "--yes") {
      yes = true;
    }
  }

  if (!profileId) {
    throw new Error("Missing required --profile-id <id> argument.");
  }

  return { ...common, profileId, yes };
}
