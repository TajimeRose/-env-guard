import test from "node:test";
import assert from "node:assert/strict";
import { computeDiff } from "../src/diff.ts";
import { parseEnvFile } from "../src/env-parser.ts";
import type { EnvUsage } from "../src/scanner.ts";

test("computeDiff detects missingInEnv, zombieInEnv, and synced keys", () => {
  const codeUsages: EnvUsage[] = [
    { key: "PORT", file: "src/server.ts", line: 10, language: "typescript" },
    { key: "DATABASE_URL", file: "src/db.ts", line: 5, language: "typescript" },
    { key: "API_KEY", file: "src/api.ts", line: 20, language: "typescript" },
  ];

  const envContent = [
    "PORT=3000",
    "DATABASE_URL=postgres://localhost/db",
    "OLD_UNUSED_FLAG=true",
  ].join("\n");
  const envFile = parseEnvFile(envContent, ".env.example");

  const diff = computeDiff(codeUsages, envFile);

  assert.deepEqual(diff.missingInEnv, ["API_KEY"]);
  assert.deepEqual(diff.zombieInEnv, ["OLD_UNUSED_FLAG"]);
  assert.deepEqual(diff.synced, ["DATABASE_URL", "PORT"]);
  assert.deepEqual(diff.secretLeaks, []);
});

test("computeDiff detects secretLeaks when AWS Key, JWT, or high entropy exists", () => {
  const envContent = [
    "# Config",
    "AWS_KEY=AKIAIOSFODNN7EXAMPLE",
    "JWT_SECRET=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc1234567890_-xyz",
    "HIGH_ENTROPY=4k8#zL9!mQ2$vP5&wX1*yN7@rT0^",
    "SAFE_VAR=development",
  ].join("\n");
  const envFile = parseEnvFile(envContent, ".env.example");

  const codeUsages: EnvUsage[] = [
    { key: "AWS_KEY", file: "src/s3.ts", line: 1, language: "typescript" },
    { key: "JWT_SECRET", file: "src/auth.ts", line: 2, language: "typescript" },
    { key: "HIGH_ENTROPY", file: "src/crypto.ts", line: 3, language: "typescript" },
    { key: "SAFE_VAR", file: "src/config.ts", line: 4, language: "typescript" },
  ];

  const diff = computeDiff(codeUsages, envFile);

  assert.equal(diff.secretLeaks.length, 3);
  assert.deepEqual(diff.secretLeaks[0], {
    key: "AWS_KEY",
    lineIndex: 1,
    reason: "AWS Access Key",
  });
  assert.deepEqual(diff.secretLeaks[1], {
    key: "JWT_SECRET",
    lineIndex: 2,
    reason: "JWT Token",
  });
  assert.deepEqual(diff.secretLeaks[2], {
    key: "HIGH_ENTROPY",
    lineIndex: 3,
    reason: "High Entropy Secret",
  });
});

test("computeDiff handles perfect sync with no diff", () => {
  const codeUsages: EnvUsage[] = [
    { key: "APP_NAME", file: "src/index.ts", line: 1, language: "typescript" },
    { key: "PORT", file: "src/index.ts", line: 2, language: "typescript" },
  ];

  const envContent = ["APP_NAME=my-app", "PORT=8080"].join("\n");
  const envFile = parseEnvFile(envContent, ".env.example");

  const diff = computeDiff(codeUsages, envFile);

  assert.deepEqual(diff.missingInEnv, []);
  assert.deepEqual(diff.zombieInEnv, []);
  assert.deepEqual(diff.synced, ["APP_NAME", "PORT"]);
  assert.deepEqual(diff.secretLeaks, []);
});

test("computeDiff handles empty env or empty code usages", () => {
  const emptyEnv = parseEnvFile("", ".env.example");
  const codeUsages: EnvUsage[] = [
    { key: "PORT", file: "src/index.ts", line: 1, language: "typescript" },
  ];

  const diffEmptyEnv = computeDiff(codeUsages, emptyEnv);
  assert.deepEqual(diffEmptyEnv.missingInEnv, ["PORT"]);
  assert.deepEqual(diffEmptyEnv.zombieInEnv, []);
  assert.deepEqual(diffEmptyEnv.synced, []);
  assert.deepEqual(diffEmptyEnv.secretLeaks, []);

  const populatedEnv = parseEnvFile("PORT=3000\nDEBUG=true", ".env.example");
  const diffEmptyCode = computeDiff([], populatedEnv);
  assert.deepEqual(diffEmptyCode.missingInEnv, []);
  assert.deepEqual(diffEmptyCode.zombieInEnv, ["DEBUG", "PORT"]);
  assert.deepEqual(diffEmptyCode.synced, []);
  assert.deepEqual(diffEmptyCode.secretLeaks, []);

  const diffBothEmpty = computeDiff([], emptyEnv);
  assert.deepEqual(diffBothEmpty.missingInEnv, []);
  assert.deepEqual(diffBothEmpty.zombieInEnv, []);
  assert.deepEqual(diffBothEmpty.synced, []);
  assert.deepEqual(diffBothEmpty.secretLeaks, []);
});
