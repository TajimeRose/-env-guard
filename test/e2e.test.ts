import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const binPath = path.resolve("bin/env-guard.js");

async function runBin(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error: any) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

async function createPolyglotFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-guard-e2e-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  const envFile = path.join(tempDir, ".env.example");

  // Create polyglot files
  await fs.writeFile(
    path.join(srcDir, "server.ts"),
    'const port = process.env.PORT;\nconst db = process.env["DATABASE_URL"];\n',
  );
  await fs.writeFile(
    path.join(srcDir, "worker.py"),
    'import os\nredis_url = os.getenv("REDIS_URL")\n',
  );
  await fs.writeFile(
    path.join(srcDir, "service.go"),
    'package main\nimport "os"\nfunc run() { apiKey := os.Getenv("SERVICE_KEY") }\n',
  );
  await fs.writeFile(
    path.join(srcDir, "main.rs"),
    'use std::env;\nfn main() { let timeout = env::var("CLIENT_TIMEOUT"); }\n',
  );

  return { tempDir, srcDir, envFile };
}

test("e2e: check passes with exit code 0 on clean polyglot project", async () => {
  const { tempDir, envFile } = await createPolyglotFixture();
  try {
    await fs.writeFile(
      envFile,
      "# App Config\nPORT=3000\nDATABASE_URL=\n\n# Services\nREDIS_URL=\nSERVICE_KEY=\nCLIENT_TIMEOUT=\n",
    );

    const res = await runBin(["check", "--dir", tempDir, "--env-file", envFile]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Check passed: all environment variables synced\./);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("e2e: check returns 1 when missing keys exist in polyglot codebase", async () => {
  const { tempDir, envFile } = await createPolyglotFixture();
  try {
    // Missing SERVICE_KEY and CLIENT_TIMEOUT
    await fs.writeFile(
      envFile,
      "PORT=3000\nDATABASE_URL=\nREDIS_URL=\n",
    );

    const res = await runBin(["check", "--dir", tempDir, "--env-file", envFile]);
    assert.equal(res.code, 1);
    assert.match(res.stdout, /Missing environment variables in/);
    assert.match(res.stdout, /SERVICE_KEY/);
    assert.match(res.stdout, /CLIENT_TIMEOUT/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("e2e: check returns 1 when secret leak is found in .env.example", async () => {
  const { tempDir, envFile } = await createPolyglotFixture();
  try {
    await fs.writeFile(
      envFile,
      "PORT=3000\nDATABASE_URL=\nREDIS_URL=\nSERVICE_KEY=AKIAIOSFODNN7EXAMPLE\nCLIENT_TIMEOUT=\n",
    );

    const res = await runBin(["check", "--dir", tempDir, "--env-file", envFile]);
    assert.equal(res.code, 1);
    assert.match(res.stdout, /Secret leaks detected in/);
    assert.match(res.stdout, /SERVICE_KEY/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("e2e: fix appends missing keys and makes check pass", async () => {
  const { tempDir, envFile } = await createPolyglotFixture();
  try {
    // Initial file missing SERVICE_KEY and CLIENT_TIMEOUT
    await fs.writeFile(
      envFile,
      "# Base\nPORT=3000\nDATABASE_URL=\nREDIS_URL=\n",
    );

    const fixRes = await runBin(["fix", "--dir", tempDir, "--env-file", envFile]);
    assert.equal(fixRes.code, 0);
    assert.match(fixRes.stdout, /Added:\s+2 keys/);

    // Verify check passes now
    const checkRes = await runBin(["check", "--dir", tempDir, "--env-file", envFile]);
    assert.equal(checkRes.code, 0);

    const content = await fs.readFile(envFile, "utf-8");
    assert.match(content, /SERVICE_KEY=/);
    assert.match(content, /CLIENT_TIMEOUT=/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("e2e: fix --prune removes zombie keys under strict requirements", async () => {
  const { tempDir, envFile } = await createPolyglotFixture();
  try {
    await fs.writeFile(
      envFile,
      "PORT=3000\nDATABASE_URL=\nREDIS_URL=\nSERVICE_KEY=\nCLIENT_TIMEOUT=\nOLD_ZOMBIE=1\n",
    );

    // strict check should fail with code 1 due to zombie
    const checkStrictRes = await runBin(["check", "--strict", "--dir", tempDir, "--env-file", envFile]);
    assert.equal(checkStrictRes.code, 1);
    assert.match(checkStrictRes.stdout, /OLD_ZOMBIE/);

    // fix --prune
    const fixRes = await runBin(["fix", "--prune", "--dir", tempDir, "--env-file", envFile]);
    assert.equal(fixRes.code, 0);
    assert.match(fixRes.stdout, /Pruned:\s+1 keys/);

    // strict check should pass now
    const checkAfterRes = await runBin(["check", "--strict", "--dir", tempDir, "--env-file", envFile]);
    assert.equal(checkAfterRes.code, 0);

    const content = await fs.readFile(envFile, "utf-8");
    assert.doesNotMatch(content, /OLD_ZOMBIE/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
