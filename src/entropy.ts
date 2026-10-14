export function calculateEntropy(str: string): number {
  const len = str.length;
  if (len === 0) return 0;

  const freq = new Map<string, number>();
  for (let i = 0; i < len; i++) {
    const char = str[i];
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

// shortcut: regex pattern set limited to common keys; add provider-specific parsers if needed
const KNOWN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /AKIA[0-9A-Z]{16}/, reason: "AWS Access Key" },
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, reason: "JWT Token" },
  { pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----/, reason: "Private Key" },
  { pattern: /sk_live_[0-9a-zA-Z]{24}/, reason: "Stripe Secret Key" },
  { pattern: /ghp_[0-9a-zA-Z]{36}/, reason: "GitHub Token" },
  { pattern: /AIza[0-9A-Za-z-_]{35}/, reason: "Google API Key" },
];

export function detectSecret(value: string): { isSecret: boolean; reason?: string } {
  if (!value) return { isSecret: false };

  for (const { pattern, reason } of KNOWN_PATTERNS) {
    if (pattern.test(value)) {
      return { isSecret: true, reason };
    }
  }

  if (value.length >= 16 && calculateEntropy(value) > 4.5) {
    return { isSecret: true, reason: "High Entropy Secret" };
  }

  return { isSecret: false };
}
