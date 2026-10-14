import test from "node:test";
import assert from "node:assert/strict";
import { parseEnvFile, serializeEnvFile } from "../src/env-parser.ts";

test("parseEnvFile classifies comment, blank, and entry lines", () => {
  const content = [
    "# Database configuration",
    "DB_HOST=localhost",
    "",
    "   ",
    "# Cache",
    "REDIS_URL=redis://localhost:6379",
  ].join("\n");

  const parsed = parseEnvFile(content, ".env");

  assert.equal(parsed.lines.length, 6);
  assert.equal(parsed.lines[0].type, "comment");
  assert.equal(parsed.lines[0].raw, "# Database configuration");

  assert.equal(parsed.lines[1].type, "entry");
  assert.equal(parsed.lines[1].key, "DB_HOST");
  assert.equal(parsed.lines[1].value, "localhost");

  assert.equal(parsed.lines[2].type, "blank");
  assert.equal(parsed.lines[2].raw, "");

  assert.equal(parsed.lines[3].type, "blank");
  assert.equal(parsed.lines[3].raw, "   ");

  assert.equal(parsed.lines[4].type, "comment");

  assert.equal(parsed.lines[5].type, "entry");
  assert.equal(parsed.lines[5].key, "REDIS_URL");
  assert.equal(parsed.lines[5].value, "redis://localhost:6379");
});

test("parseEnvFile extracts keys and values accurately across quote styles and edge cases", () => {
  const content = [
    "PORT=3000",
    'APP_NAME="Env Guard Test"',
    "APP_ENV='production'",
    "EMPTY_VAL=",
    'EMPTY_DOUBLE=""',
    "EMPTY_SINGLE=''",
    'WITH_HASH="value with # hash"',
    "INLINE_COMMENT=unquoted # this is a comment",
    'QUOTED_INLINE="quoted value" # trailing comment',
    "URL_WITH_HASH=https://example.com#anchor",
    "export EXPORTED_KEY=enabled",
  ].join("\n");

  const parsed = parseEnvFile(content, ".env.example");

  assert.equal(parsed.entries.get("PORT")?.value, "3000");
  assert.equal(parsed.entries.get("PORT")?.lineIndex, 0);

  assert.equal(parsed.entries.get("APP_NAME")?.value, "Env Guard Test");
  assert.equal(parsed.entries.get("APP_ENV")?.value, "production");

  assert.equal(parsed.entries.get("EMPTY_VAL")?.value, "");
  assert.equal(parsed.entries.get("EMPTY_DOUBLE")?.value, "");
  assert.equal(parsed.entries.get("EMPTY_SINGLE")?.value, "");

  assert.equal(parsed.entries.get("WITH_HASH")?.value, "value with # hash");
  assert.equal(parsed.entries.get("INLINE_COMMENT")?.value, "unquoted");
  assert.equal(parsed.entries.get("QUOTED_INLINE")?.value, "quoted value");
  assert.equal(parsed.entries.get("URL_WITH_HASH")?.value, "https://example.com#anchor");
  assert.equal(parsed.entries.get("EXPORTED_KEY")?.value, "enabled");
});

test("serializeEnvFile preserves whitespace and newline 1:1", () => {
  const sampleLF = [
    "# Header comment",
    "",
    "PORT=8080   # Port definition",
    'SECRET_KEY="sk_live_12345"',
    "",
    "   # Indented comment",
    "DEBUG=false",
    "",
  ].join("\n");

  const parsedLF = parseEnvFile(sampleLF, ".env");
  const serializedLF = serializeEnvFile(parsedLF);
  assert.equal(serializedLF, sampleLF);

  const sampleCRLF = [
    "# Windows format",
    "HOST=127.0.0.1",
    "",
    "PORT=5000",
  ].join("\r\n");

  const parsedCRLF = parseEnvFile(sampleCRLF, ".env");
  const serializedCRLF = serializeEnvFile(parsedCRLF);
  assert.equal(serializedCRLF, sampleCRLF);
});
