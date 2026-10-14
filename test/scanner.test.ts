import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { scanFile, scanDirectory } from "../src/scanner.ts";

test("scanFile detects env usages in JS/TS", () => {
  const tsCode = `
const port = process.env.PORT;
const dbUrl = process.env['DATABASE_URL'];
const apiUrl = import.meta.env.VITE_API_URL;
const optPort = process.env?.OPT_PORT;
const optBracket = process.env?.['OPT_BRACKET'];
const optMeta = import.meta.env?.OPT_META;
`;
  const tsResults = scanFile("src/app.ts", tsCode);
  assert.equal(tsResults.length, 6);
  assert.deepEqual(tsResults[0], { key: "PORT", file: "src/app.ts", line: 2, language: "typescript" });
  assert.deepEqual(tsResults[1], { key: "DATABASE_URL", file: "src/app.ts", line: 3, language: "typescript" });
  assert.deepEqual(tsResults[2], { key: "VITE_API_URL", file: "src/app.ts", line: 4, language: "typescript" });
  assert.deepEqual(tsResults[3], { key: "OPT_PORT", file: "src/app.ts", line: 5, language: "typescript" });
  assert.deepEqual(tsResults[4], { key: "OPT_BRACKET", file: "src/app.ts", line: 6, language: "typescript" });
  assert.deepEqual(tsResults[5], { key: "OPT_META", file: "src/app.ts", line: 7, language: "typescript" });

  const jsCode = `const secret = process.env["SESSION_SECRET"];`;
  const jsResults = scanFile("server.js", jsCode);
  assert.equal(jsResults.length, 1);
  assert.deepEqual(jsResults[0], { key: "SESSION_SECRET", file: "server.js", line: 1, language: "javascript" });
});

test("scanFile detects env usages in Python", () => {
  const pyCode = `
redis_url = os.environ.get("REDIS_URL")
secret_key = os.getenv("SECRET_KEY")
api_key = os.environ["API_KEY"]
default_port = os.getenv("PORT", "8080")
default_timeout = os.environ.get("TIMEOUT", 30)
default_none = os.environ.get('OPTIONAL_KEY', None)
`;
  const results = scanFile("app.py", pyCode);
  assert.equal(results.length, 6);
  assert.deepEqual(results[0], { key: "REDIS_URL", file: "app.py", line: 2, language: "python" });
  assert.deepEqual(results[1], { key: "SECRET_KEY", file: "app.py", line: 3, language: "python" });
  assert.deepEqual(results[2], { key: "API_KEY", file: "app.py", line: 4, language: "python" });
  assert.deepEqual(results[3], { key: "PORT", file: "app.py", line: 5, language: "python" });
  assert.deepEqual(results[4], { key: "TIMEOUT", file: "app.py", line: 6, language: "python" });
  assert.deepEqual(results[5], { key: "OPTIONAL_KEY", file: "app.py", line: 7, language: "python" });
});

test("scanFile detects env usages in Go", () => {
  const goCode = `
appEnv := os.Getenv("APP_ENV")
dbPass, ok := os.LookupEnv("DB_PASS")
`;
  const results = scanFile("main.go", goCode);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], { key: "APP_ENV", file: "main.go", line: 2, language: "go" });
  assert.deepEqual(results[1], { key: "DB_PASS", file: "main.go", line: 3, language: "go" });
});

test("scanFile detects env usages in Rust", () => {
  const rsCode = `
let port = env::var("PORT").unwrap();
let db = std::env::var("DATABASE_URL").unwrap();
`;
  const results = scanFile("main.rs", rsCode);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], { key: "PORT", file: "main.rs", line: 2, language: "rust" });
  assert.deepEqual(results[1], { key: "DATABASE_URL", file: "main.rs", line: 3, language: "rust" });
});

test("scanFile skips comment lines and commented blocks", () => {
  const tsCode = `
// process.env.IGNORED_COMMENT_LINE
const active = process.env.ACTIVE_VAR; // process.env.IGNORED_INLINE
/* process.env.IGNORED_BLOCK_SINGLE */
/*
  process.env.IGNORED_BLOCK_MULTI_1
  process.env.IGNORED_BLOCK_MULTI_2
*/
const nextActive = process.env.NEXT_ACTIVE;
`;
  const tsResults = scanFile("app.ts", tsCode);
  assert.deepEqual(
    tsResults.map((r) => r.key),
    ["ACTIVE_VAR", "NEXT_ACTIVE"]
  );

  const pyCode = `
# os.getenv("IGNORED_PY_COMMENT")
val = os.getenv("ACTIVE_PY") # os.environ["IGNORED_PY_INLINE"]
"""
os.environ.get("IGNORED_PY_DOCSTRING")
"""
`;
  const pyResults = scanFile("app.py", pyCode);
  assert.deepEqual(
    pyResults.map((r) => r.key),
    ["ACTIVE_PY"]
  );
});

test("scanDirectory recursively scans files and skips ignored folders", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-guard-scanner-test-"));

  try {
    // Valid project files
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "src", "index.ts"), "const port = process.env.PORT;");

    await fs.mkdir(path.join(tmpDir, "scripts"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "scripts", "worker.py"), "url = os.getenv('WORKER_URL')");

    // Ignored directories
    await fs.mkdir(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "node_modules", "pkg", "index.js"), "process.env.IGNORED_NM");

    await fs.mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".git", "hook.js"), "process.env.IGNORED_GIT");

    await fs.mkdir(path.join(tmpDir, "dist"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "dist", "bundle.js"), "process.env.IGNORED_DIST");

    await fs.mkdir(path.join(tmpDir, "coverage"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "coverage", "report.js"), "process.env.IGNORED_COV");

    const usages = await scanDirectory(tmpDir);
    const keys = usages.map((u) => u.key).sort();

    assert.deepEqual(keys, ["PORT", "WORKER_URL"]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
