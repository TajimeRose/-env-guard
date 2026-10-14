export interface EnvLine {
  type: "comment" | "blank" | "entry";
  raw: string;
  key?: string;
  value?: string;
}

export interface EnvFile {
  filePath: string;
  lines: EnvLine[];
  entries: Map<string, { value: string; lineIndex: number }>;
  eol?: string;
}

function parseEntryValue(rawVal: string): string {
  const trimmed = rawVal.trim();
  if (!trimmed) return "";

  const firstChar = trimmed[0];
  if (firstChar === '"' || firstChar === "'") {
    let endQuoteIdx = -1;
    let isEscaped = false;
    for (let i = 1; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        continue;
      }
      if (char === firstChar) {
        endQuoteIdx = i;
        break;
      }
    }

    if (endQuoteIdx !== -1) {
      const inner = trimmed.slice(1, endQuoteIdx);
      if (firstChar === '"') {
        return inner.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      }
      return inner;
    }
  }

  if (trimmed.startsWith("#")) {
    return "";
  }

  const commentIdx = trimmed.search(/\s+#/);
  if (commentIdx !== -1) {
    return trimmed.slice(0, commentIdx).trim();
  }

  return trimmed;
}

// shortcut: basic parser covering standard dotenv, quotes and inline comments; add multiline values if needed
export function parseEnvFile(content: string, filePath: string): EnvFile {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const rawLines = content.length > 0 ? content.split(eol) : [];
  const lines: EnvLine[] = [];
  const entries = new Map<string, { value: string; lineIndex: number }>();

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();

    if (trimmed === "") {
      lines.push({ type: "blank", raw });
    } else if (trimmed.startsWith("#")) {
      lines.push({ type: "comment", raw });
    } else {
      const match = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/);
      if (match) {
        const key = match[1];
        const value = parseEntryValue(match[2]);
        const lineIndex = lines.length;
        lines.push({ type: "entry", raw, key, value });
        entries.set(key, { value, lineIndex });
      } else {
        lines.push({ type: "comment", raw });
      }
    }
  }

  return { filePath, lines, entries, eol };
}

export function serializeEnvFile(envFile: EnvFile): string {
  const eol = envFile.eol ?? "\n";
  return envFile.lines
    .map((l) => {
      if (l.raw !== undefined) return l.raw;
      if (l.type === "blank" || l.type === "comment") return "";
      return `${l.key}="${l.value ?? ""}"`;
    })
    .join(eol);
}
