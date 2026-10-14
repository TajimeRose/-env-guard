import type { EnvFile } from "./env-parser.ts";
import type { EnvUsage } from "./scanner.ts";
import { detectSecret } from "./entropy.ts";

export interface SecretLeak {
  key: string;
  lineIndex: number;
  reason: string;
}

export interface EnvDiff {
  missingInEnv: string[];
  zombieInEnv: string[];
  synced: string[];
  secretLeaks: SecretLeak[];
}

export function computeDiff(codeUsages: EnvUsage[], envFile: EnvFile): EnvDiff {
  const codeKeys = new Set((codeUsages || []).map((u) => u.key));
  const envKeys = new Set(envFile?.entries ? envFile.entries.keys() : []);

  const missingInEnv = Array.from(codeKeys)
    .filter((k) => !envKeys.has(k))
    .sort();

  const zombieInEnv = Array.from(envKeys)
    .filter((k) => !codeKeys.has(k))
    .sort();

  const synced = Array.from(codeKeys)
    .filter((k) => envKeys.has(k))
    .sort();

  const secretLeaks: SecretLeak[] = [];
  if (envFile?.entries) {
    for (const [key, { value, lineIndex }] of envFile.entries) {
      const check = detectSecret(value);
      if (check.isSecret && check.reason) {
        secretLeaks.push({
          key,
          lineIndex,
          reason: check.reason,
        });
      }
    }
  }

  return {
    missingInEnv,
    zombieInEnv,
    synced,
    secretLeaks,
  };
}
