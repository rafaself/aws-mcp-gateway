import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { APP_CONFIG_BINDING } from "./wrangler-config.js";

const execFileAsync = promisify(execFile);

export type AppProfileKvStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type WranglerKvStoreOptions = {
  configPath: string;
  env?: string;
  remote: boolean;
  wranglerBin?: string;
};

function buildWranglerArgs(
  options: WranglerKvStoreOptions,
  command: "get" | "put" | "delete",
  key: string,
  extraArgs: string[] = [],
): string[] {
  const args = [
    "kv",
    "key",
    command,
    key,
    "--binding",
    APP_CONFIG_BINDING,
    "--config",
    options.configPath,
  ];

  if (options.env) {
    args.push("--env", options.env);
  }

  if (options.remote) {
    args.push("--remote");
  } else {
    args.push("--local");
  }

  args.push(...extraArgs);
  return args;
}

async function runWrangler(
  options: WranglerKvStoreOptions,
  command: "get" | "put" | "delete",
  key: string,
  extraArgs: string[] = [],
): Promise<{ stdout: string; stderr: string }> {
  const wranglerBin = options.wranglerBin ?? "wrangler";
  const args = buildWranglerArgs(options, command, key, extraArgs);

  try {
    return await execFileAsync(wranglerBin, args, {
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number;
    };

    if (command === "get" && execError.code === 1) {
      const stderr = execError.stderr ?? "";
      if (stderr.includes("not found") || stderr.includes("does not exist")) {
        return { stdout: "", stderr };
      }
    }

    const message = execError.stderr?.trim() || execError.message || "Wrangler command failed.";
    throw new Error(message);
  }
}

export function createWranglerKvStore(options: WranglerKvStoreOptions): AppProfileKvStore {
  return {
    async get(key: string): Promise<string | null> {
      const { stdout } = await runWrangler(options, "get", key);
      const trimmed = stdout.trim();
      return trimmed.length > 0 ? trimmed : null;
    },

    async put(key: string, value: string): Promise<void> {
      const tempDir = await mkdtemp(join(tmpdir(), "app-profile-kv-"));
      const tempFile = join(tempDir, "value.json");

      try {
        await writeFile(tempFile, value, "utf8");
        await runWrangler(options, "put", key, ["--path", tempFile]);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },

    async delete(key: string): Promise<void> {
      await runWrangler(options, "delete", key);
    },
  };
}

export function createInMemoryKvStore(initial: Record<string, string> = {}): AppProfileKvStore {
  const store = new Map(Object.entries(initial));

  return {
    async get(key: string): Promise<string | null> {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },

    async put(key: string, value: string): Promise<void> {
      store.set(key, value);
    },

    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

export async function readJsonFromKv<T>(
  kv: AppProfileKvStore,
  key: string,
): Promise<{ exists: boolean; raw: string | null; parsed: T | null }> {
  const raw = await kv.get(key);
  if (raw === null) {
    return { exists: false, raw: null, parsed: null };
  }

  try {
    return { exists: true, raw, parsed: JSON.parse(raw) as T };
  } catch {
    throw new Error(`Invalid JSON at KV key ${key}.`);
  }
}

export async function writeJsonToKv(kv: AppProfileKvStore, key: string, value: unknown): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await kv.put(key, serialized);
}

export async function readProfileFile(filePath: string): Promise<{ raw: string; parsed: unknown }> {
  const raw = await readFile(filePath, "utf8");
  try {
    return { raw, parsed: JSON.parse(raw) as unknown };
  } catch {
    throw new Error(`Invalid JSON in profile file: ${filePath}`);
  }
}
