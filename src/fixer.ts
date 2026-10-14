import * as fs from "node:fs/promises";
import { serializeEnvFile, type EnvFile, type EnvLine } from "./env-parser.ts";
import type { EnvDiff } from "./diff.ts";

export interface FixOptions {
  prune?: boolean;
}

export interface FixResult {
  updatedEnvFile: EnvFile;
  addedKeys: string[];
  prunedKeys: string[];
}

// shortcut: basic fixer with in-memory line editing; add interactive prompt/conflict resolution when requested
export function applyFix(
  envFile: EnvFile,
  diff: EnvDiff,
  options: FixOptions = {}
): FixResult {
  const prune = options.prune ?? false;
  const zombieSet = new Set(diff.zombieInEnv ?? []);

  const prunedKeys: string[] = [];
  const lines: EnvLine[] = [];

  for (const line of envFile.lines ?? []) {
    if (prune && line.type === "entry" && line.key && zombieSet.has(line.key)) {
      if (!prunedKeys.includes(line.key)) {
        prunedKeys.push(line.key);
      }
      continue;
    }
    lines.push(line);
  }

  const addedKeys: string[] = [];
  const existingKeys = new Set(
    lines.filter((l) => l.type === "entry" && l.key).map((l) => l.key!)
  );

  const hasTrailingBlank =
    lines.length > 0 &&
    lines[lines.length - 1].type === "blank" &&
    lines[lines.length - 1].raw === "";
  const trailingLine = hasTrailingBlank ? lines.pop() : null;

  for (const key of diff.missingInEnv ?? []) {
    if (!existingKeys.has(key)) {
      addedKeys.push(key);
      existingKeys.add(key);
      lines.push({
        type: "entry",
        raw: `${key}=`,
        key,
        value: "",
      });
    }
  }

  if (trailingLine) {
    lines.push(trailingLine);
  }

  const entries = new Map<string, { value: string; lineIndex: number }>();
  lines.forEach((line, index) => {
    if (line.type === "entry" && line.key !== undefined) {
      entries.set(line.key, {
        value: line.value ?? "",
        lineIndex: index,
      });
    }
  });

  const updatedEnvFile: EnvFile = {
    filePath: envFile.filePath,
    lines,
    entries,
    eol: envFile.eol,
  };

  return { updatedEnvFile, addedKeys, prunedKeys };
}

export async function writeEnvFile(envFile: EnvFile, targetPath?: string): Promise<void> {
  const dest = targetPath ?? envFile.filePath;
  const content = serializeEnvFile(envFile);
  await fs.writeFile(dest, content, "utf-8");
}
