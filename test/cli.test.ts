import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runCli } from "../src/cli.ts";

const silentIO = {
  stdout: () => {},
  stderr: () => {},
};

async function createTempFixture(): Promise<{
  tempDir: string;
  srcDir: string;
  envFile: string;
}> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-guard-cli-test-"));
  const srcDir = path.join(tempDir, "src");
  await fs.mkdir(srcDir, { recursive: true });
  const envFile = path.join(tempDir, ".env.example");
  return { tempDir, srcDir, envFile };
}

test("check: returns exit code 0 when all keys are synced", async () => {
  const { tempDir, srcDir, envFile } = await createTempFixture();
  try {
    await fs.writeFile(path.join(srcDir, "app.ts"), "const port = process.env.PORT;");
    await fs.writeFile(envFile, "PORT=3000\n");

    const code = await runCli(["check", "--dir", tempDir, "--env-file", envFile], silentIO);
    assert.equal(code, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("check: defaults to check command when no command argument provided", async () => {
  const { tempDir, srcDir, envFile } = await createTempFixture();
  try {
    await fs.writeFile(path.join(srcDir, "app.ts"), "const port = process.env.PORT;");
    await fs.writeFile(envFile, "PORT=3000\n");

    const code = await runCli(["--dir", tempDir, "--env-file", envFile], silentIO);
    assert.equal(code, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("check: returns exit code 1 when missing keys exist in code", async () => {
  const { tempDir, srcDir, envFile } = await createTempFixture();
  try {
    await fs.writeFile(
      path.join(srcDir, "app.ts"),
      "const port = process.env.PORT;\nconst key = process.env.API_KEY;"
    );
    await fs.writeFile(envFile, "PORT=3000\n");

    const code = await runCli(["check", "--dir", tempDir, "--env-file", envFile], silentIO);
    assert.equal(code, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("check: returns exit code 0 for zombie keys in non-strict mode", async () => {
  const { tempDir, srcDir, envFile } = await createTempFixture();
  try {
    await fs.writeFile(path.join(srcDir, "app.ts"), "const port = process.env.PORT;");
    await fs.writeFile(envFile, "PORT=3000\nOLD_ZOMBIE=deprecated\n");

    const code = await runCli(["check", "--dir", tempDir, "--env-file", envFile], silentIO);
    assert.equal(code, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("check: returns exit code 1 for zombie keys in strict mode", async () => {
  const { tempDir, srcDir, envFile } = await createTempFixture();
  try {
    await fs.writeFile(path.join(srcDir, "app.ts"), "const port = process.env.PORT;");
    await fs.writeFile(envFile, "PORT=3000\nOLD_ZOMBIE=deprecated\n");

    const code = await runCli(
      ["check", "--strict", "--dir", tempDir, "--env-file", envFile],
      silentIO
    );
    assert.equal(code, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("check: returns exit code 1 when secret leak is detected in .env.example", async () => {
  const { tempDir, srcDir, envFile } = await createTempFixture();
  try {
    await fs.writeFile(path.join(srcDir, "app.ts"), "const s = process.env.AWS_ACCESS_KEY_ID;");
    await fs.writeFile(envFile, "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n");

    const code = await runCli(["check", "--dir", tempDir, "--env-file", envFile], silentIO);
    assert.equal(code, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("fix: adds missing keys and returns exit code 0", async () => {
  const { tempDir, srcDir, envFile } = await createTempFixture();
  try {
    await fs.writeFile(
      path.join(srcDir, "app.ts"),
      "const port = process.env.PORT;\nconst db = process.env.DATABASE_URL;"
    );
    await fs.writeFile(envFile, "PORT=3000\n");

    const code = await runCli(["fix", "--dir", tempDir, "--env-file", envFile], silentIO);
    assert.equal(code, 0);

    const updated = await fs.readFile(envFile, "utf-8");
    assert.ok(updated.includes("DATABASE_URL="));
    assert.ok(updated.includes("PORT=3000"));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("fix: --prune removes zombie keys and returns exit code 0", async () => {
  const { tempDir, srcDir, envFile } = await createTempFixture();
  try {
    await fs.writeFile(path.join(srcDir, "app.ts"), "const port = process.env.PORT;");
    await fs.writeFile(envFile, "PORT=3000\nZOMBIE_KEY=old\n");

    const code = await runCli(
      ["fix", "--prune", "--dir", tempDir, "--env-file", envFile],
      silentIO
    );
    assert.equal(code, 0);

    const updated = await fs.readFile(envFile, "utf-8");
    assert.ok(!updated.includes("ZOMBIE_KEY"));
    assert.ok(updated.includes("PORT=3000"));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("global flags: --help and -h return exit code 0", async () => {
  let output = "";
  const io = {
    stdout: (msg: string) => {
      output += msg;
    },
    stderr: () => {},
  };

  const codeHelp = await runCli(["--help"], io);
  assert.equal(codeHelp, 0);
  assert.ok(output.includes("env-guard"));
  assert.ok(output.includes("Usage:"));

  const codeShortHelp = await runCli(["-h"], silentIO);
  assert.equal(codeShortHelp, 0);
});

test("global flags: --version and -v return exit code 0", async () => {
  let output = "";
  const io = {
    stdout: (msg: string) => {
      output += msg;
    },
    stderr: () => {},
  };

  const codeVersion = await runCli(["--version"], io);
  assert.equal(codeVersion, 0);
  assert.ok(output.includes("0.1.0"));

  const codeShortVersion = await runCli(["-v"], silentIO);
  assert.equal(codeShortVersion, 0);
});

test("error handling: returns exit code 2 when env file does not exist", async () => {
  const { tempDir } = await createTempFixture();
  try {
    const code = await runCli(
      ["check", "--dir", tempDir, "--env-file", path.join(tempDir, "missing.env")],
      silentIO
    );
    assert.equal(code, 2);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("error handling: returns exit code 2 when directory does not exist", async () => {
  const { tempDir, envFile } = await createTempFixture();
  try {
    await fs.writeFile(envFile, "PORT=3000\n");
    const code = await runCli(
      ["check", "--dir", path.join(tempDir, "missing_dir"), "--env-file", envFile],
      silentIO
    );
    assert.equal(code, 2);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("error handling: returns exit code 2 on unknown command or invalid flags", async () => {
  const codeCmd = await runCli(["invalid-command"], silentIO);
  assert.equal(codeCmd, 2);

  const codeFlag = await runCli(["check", "--invalid-flag"], silentIO);
  assert.equal(codeFlag, 2);

  const codeExtraArg = await runCli(["check", "unexpected-arg"], silentIO);
  assert.equal(codeExtraArg, 2);
});
