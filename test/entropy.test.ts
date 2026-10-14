import test from "node:test";
import assert from "node:assert/strict";
import { calculateEntropy, detectSecret } from "../src/entropy.ts";

test("calculateEntropy calculates expected Shannon entropy", () => {
  assert.equal(calculateEntropy(""), 0);
  assert.equal(calculateEntropy("aaaa"), 0);

  const normalEntropy = calculateEntropy("development");
  const randomEntropy = calculateEntropy("4k8#zL9!mQ2$vP5&wX1*yN7@rT0^");

  assert.ok(normalEntropy < 4.0, "normal string entropy should be low");
  assert.ok(randomEntropy > 4.5, "random string entropy should exceed 4.5");
});

test("detectSecret detects known secret patterns", () => {
  const awsResult = detectSecret("AKIAIOSFODNN7EXAMPLE");
  assert.deepEqual(awsResult, { isSecret: true, reason: "AWS Access Key" });

  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc1234567890_-xyz";
  const jwtResult = detectSecret(jwt);
  assert.deepEqual(jwtResult, { isSecret: true, reason: "JWT Token" });

  const privateKey = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA...";
  const privateKeyResult = detectSecret(privateKey);
  assert.deepEqual(privateKeyResult, { isSecret: true, reason: "Private Key" });

  const stripeDummy = ["sk", "live", "1234567890abcdefghijklmn"].join("_");
  const stripeResult = detectSecret(stripeDummy);
  assert.deepEqual(stripeResult, { isSecret: true, reason: "Stripe Secret Key" });

  const githubDummy = ["ghp", "1234567890abcdefghijklmnopqrstuvwxyzAB"].join("_");
  const githubResult = detectSecret(githubDummy);
  assert.deepEqual(githubResult, { isSecret: true, reason: "GitHub Token" });

  const googleResult = detectSecret("AIzaSyA1234567890abcdefghijklmnopqrstuv");
  assert.deepEqual(googleResult, { isSecret: true, reason: "Google API Key" });
});

test("detectSecret ignores non-secret and standard values", () => {
  assert.deepEqual(detectSecret(""), { isSecret: false });
  assert.deepEqual(detectSecret("development"), { isSecret: false });
  assert.deepEqual(detectSecret("localhost:3000"), { isSecret: false });
  assert.deepEqual(detectSecret("production"), { isSecret: false });
});

test("detectSecret detects high entropy generic secrets", () => {
  const secretResult = detectSecret("4k8#zL9!mQ2$vP5&wX1*yN7@rT0^");
  assert.deepEqual(secretResult, { isSecret: true, reason: "High Entropy Secret" });
});
