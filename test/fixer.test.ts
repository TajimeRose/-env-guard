import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { applyFix, writeEnvFile } from "../src/fixer.ts";
import { parseEnvFile, serializeEnvFile } from "../src/env-parser.ts";
import type { EnvDiff } from "../src/diff.ts";

test("applyFix appends missing keys as KEY= while preserving existing formatting and comments", () => {
  const content = [
    "# Application Settings",
    "PORT=3000",
    "",
    "# Database Configuration",
    "DB_HOST=localhost",
    "DB_PORT=5432",
  ].join("\n");
  const envFile = parseEnvFile(content, ".env.example");

  const diff: EnvDiff = {
    missingInEnv: ["API_KEY", "JWT_SECRET"],
    zombieInEnv: [],
    synced: ["PORT", "DB_HOST", "DB_PORT"],
    secretLeaks: [],
  };

  const { updatedEnvFile, addedKeys, prunedKeys } = applyFix(envFile, diff);

  assert.deepEqual(addedKeys, ["API_KEY", "JWT_SECRET"]);
  assert.deepEqual(prunedKeys, []);
  assert.equal(updatedEnvFile.entries.get("API_KEY")?.value, "");
  assert.equal(updatedEnvFile.entries.get("JWT_SECRET")?.value, "");

  const serialized = serializeEnvFile(updatedEnvFile);
  const expected = [
    "# Application Settings",
    "PORT=3000",
    "",
    "# Database Configuration",
    "DB_HOST=localhost",
    "DB_PORT=5432",
    "API_KEY=",
    "JWT_SECRET=",
  ].join("\n");

  assert.equal(serialized, expected);
});

test("applyFix prunes zombie keys when prune option is true and keeps comments and blank lines", () => {
  const content = [
    "# Server Config",
    "PORT=3000",
    "OLD_UNUSED_FLAG=true",
    "",
    "# Cache",
    "REDIS_URL=redis://localhost:6379",
    "UNUSED_CACHE_TIMEOUT=60",
  ].join("\n");
  const envFile = parseEnvFile(content, ".env.example");

  const diff: EnvDiff = {
    missingInEnv: [],
    zombieInEnv: ["OLD_UNUSED_FLAG", "UNUSED_CACHE_TIMEOUT"],
    synced: ["PORT", "REDIS_URL"],
    secretLeaks: [],
  };

  const { updatedEnvFile, addedKeys, prunedKeys } = applyFix(envFile, diff, { prune: true });

  assert.deepEqual(addedKeys, []);
  assert.deepEqual(prunedKeys, ["OLD_UNUSED_FLAG", "UNUSED_CACHE_TIMEOUT"]);
  assert.equal(updatedEnvFile.entries.has("OLD_UNUSED_FLAG"), false);
  assert.equal(updatedEnvFile.entries.has("UNUSED_CACHE_TIMEOUT"), false);
  assert.equal(updatedEnvFile.entries.has("PORT"), true);
  assert.equal(updatedEnvFile.entries.has("REDIS_URL"), true);

  const serialized = serializeEnvFile(updatedEnvFile);
  const expected = [
    "# Server Config",
    "PORT=3000",
    "",
    "# Cache",
    "REDIS_URL=redis://localhost:6379",
  ].join("\n");

  assert.equal(serialized, expected);
});

test("applyFix does not prune zombie keys when prune is false or omitted", () => {
  const content = [
    "PORT=3000",
    "ZOMBIE_KEY=deprecated_value",
  ].join("\n");
  const envFile = parseEnvFile(content, ".env.example");

  const diff: EnvDiff = {
    missingInEnv: [],
    zombieInEnv: ["ZOMBIE_KEY"],
    synced: ["PORT"],
    secretLeaks: [],
  };

  const defaultResult = applyFix(envFile, diff);
  assert.deepEqual(defaultResult.prunedKeys, []);
  assert.equal(defaultResult.updatedEnvFile.entries.has("ZOMBIE_KEY"), true);
  assert.equal(serializeEnvFile(defaultResult.updatedEnvFile), content);

  const explicitFalseResult = applyFix(envFile, diff, { prune: false });
  assert.deepEqual(explicitFalseResult.prunedKeys, []);
  assert.equal(explicitFalseResult.updatedEnvFile.entries.has("ZOMBIE_KEY"), true);
  assert.equal(serializeEnvFile(explicitFalseResult.updatedEnvFile), content);
});

test("applyFix handles case with no changes", () => {
  const content = [
    "# All in sync",
    "PORT=3000",
    "DB_URL=postgres://localhost/test",
  ].join("\n");
  const envFile = parseEnvFile(content, ".env.example");

  const diff: EnvDiff = {
    missingInEnv: [],
    zombieInEnv: [],
    synced: ["PORT", "DB_URL"],
    secretLeaks: [],
  };

  const { updatedEnvFile, addedKeys, prunedKeys } = applyFix(envFile, diff);

  assert.deepEqual(addedKeys, []);
  assert.deepEqual(prunedKeys, []);
  assert.equal(serializeEnvFile(updatedEnvFile), content);
  assert.equal(updatedEnvFile.lines.length, envFile.lines.length);
});

test("writeEnvFile writes serialized env content to disk", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-guard-fixer-"));
  const targetFile = path.join(tempDir, ".env.test");

  try {
    const envFile = parseEnvFile("PORT=8080\n", targetFile);
    const diff: EnvDiff = {
      missingInEnv: ["APP_ENV"],
      zombieInEnv: [],
      synced: ["PORT"],
      secretLeaks: [],
    };

    const { updatedEnvFile } = applyFix(envFile, diff);
    await writeEnvFile(updatedEnvFile);

    const savedContent = await fs.readFile(targetFile, "utf-8");
    assert.equal(savedContent, "PORT=8080\nAPP_ENV=\n");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
