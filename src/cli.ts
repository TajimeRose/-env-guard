import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { scanDirectory } from "./scanner.ts";
import { parseEnvFile } from "./env-parser.ts";
import { computeDiff } from "./diff.ts";
import { applyFix, writeEnvFile } from "./fixer.ts";

export interface CliIO {
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
}

const HELP_TEXT = `env-guard v${pkg.version} - Environment Variable Audit & Auto-sync Tool

Usage:
  env-guard [command] [options]

Commands:
  check               Scan codebase and audit .env.example (default)
  fix                 Add missing keys to .env.example

Options:
  -h, --help          Show this help message
  -v, --version       Show version number
      --strict        Fail on zombie keys in check mode
      --prune         Remove zombie keys in fix mode
      --env-file      Path to env file (default: .env.example)
      --dir           Path to project root directory (default: .)
`;

// shortcut: basic CLI runner using node:util parseArgs; add interactive mode or config file when requested
export async function runCli(args: string[] = [], io?: CliIO): Promise<number> {
  const log = io?.stdout ?? console.log;
  const error = io?.stderr ?? console.error;

  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        strict: { type: "boolean" },
        prune: { type: "boolean" },
        "env-file": { type: "string", default: ".env.example" },
        dir: { type: "string", default: "." },
      },
      allowPositionals: true,
    });
  } catch (err: any) {
    error(`Error: ${err?.message ?? String(err)}`);
    return 2;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    log(HELP_TEXT);
    return 0;
  }

  if (values.version) {
    log(`env-guard v${pkg.version}`);
    return 0;
  }

  const command = positionals[0] ?? "check";
  if (command !== "check" && command !== "fix") {
    error(`Error: Unknown command "${command}". Available commands: check, fix`);
    return 2;
  }

  if (positionals.length > 1) {
    error(`Error: Unexpected argument "${positionals[1]}"`);
    return 2;
  }

  const envFilePath = String(values["env-file"] ?? ".env.example");
  const dirPath = String(values.dir ?? ".");
  const resolvedEnvPath = path.resolve(process.cwd(), envFilePath);
  const resolvedDirPath = path.resolve(process.cwd(), dirPath);

  try {
    const dirStat = await fs.stat(resolvedDirPath);
    if (!dirStat.isDirectory()) {
      error(`Error: Path is not a directory: ${resolvedDirPath}`);
      return 2;
    }

    const envContent = await fs.readFile(resolvedEnvPath, "utf-8");
    const codeUsages = await scanDirectory(resolvedDirPath);
    const envFile = parseEnvFile(envContent, resolvedEnvPath);
    const diff = computeDiff(codeUsages, envFile);

    if (command === "check") {
      log(`Scanning directory: ${dirPath}`);
      log(`Env file: ${envFilePath}\n`);

      log("Results:");
      log(`  Synced:       ${diff.synced.length}`);
      log(`  Missing:      ${diff.missingInEnv.length}`);
      log(`  Zombie:       ${diff.zombieInEnv.length}`);
      log(`  Secret Leaks: ${diff.secretLeaks.length}\n`);

      if (diff.missingInEnv.length > 0) {
        log(`Missing environment variables in ${envFilePath}:`);
        for (const key of diff.missingInEnv) {
          log(`  - ${key}`);
        }
        log("");
      }

      if (diff.zombieInEnv.length > 0) {
        log(`Zombie environment variables in ${envFilePath} (not used in code):`);
        for (const key of diff.zombieInEnv) {
          log(`  - ${key}`);
        }
        log("");
      }

      if (diff.secretLeaks.length > 0) {
        log(`Secret leaks detected in ${envFilePath}:`);
        for (const leak of diff.secretLeaks) {
          log(`  - ${leak.key} (line ${leak.lineIndex + 1}): ${leak.reason}`);
        }
        log("");
      }

      const isStrict = Boolean(values.strict);
      const hasMissing = diff.missingInEnv.length > 0;
      const hasSecrets = diff.secretLeaks.length > 0;
      const hasZombies = diff.zombieInEnv.length > 0;

      if (hasMissing || hasSecrets || (isStrict && hasZombies)) {
        error("Check failed.");
        return 1;
      }

      if (hasZombies) {
        log("Check passed (with zombie warnings).");
        return 0;
      }

      log("Check passed: all environment variables synced.");
      return 0;
    }

    // command === "fix"
    const fixResult = applyFix(envFile, diff, { prune: Boolean(values.prune) });
    await writeEnvFile(fixResult.updatedEnvFile, resolvedEnvPath);

    log(`Fixed ${envFilePath}:`);
    log(
      `  Added:   ${fixResult.addedKeys.length} keys${
        fixResult.addedKeys.length > 0 ? ` (${fixResult.addedKeys.join(", ")})` : ""
      }`
    );
    log(
      `  Pruned:  ${fixResult.prunedKeys.length} keys${
        fixResult.prunedKeys.length > 0 ? ` (${fixResult.prunedKeys.join(", ")})` : ""
      }`
    );

    return 0;
  } catch (err: any) {
    error(`Error: ${err?.message ?? String(err)}`);
    return 2;
  }
}
