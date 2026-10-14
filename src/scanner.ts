import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface EnvUsage {
  key: string;
  file: string;
  line: number;
  language: string;
}

export const DEFAULT_IGNORE_DIRS: Set<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "vendor",
  "target",
  "__pycache__",
  ".venv",
  ".next",
  "coverage",
]);

export const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
};

const JS_TS_PATTERNS: RegExp[] = [
  /process\.env(?:\??\.)([A-Z0-9_]+)/g,
  /process\.env(?:\?\.)?\[['"]([A-Z0-9_]+)['"]\]/g,
  /import\.meta\.env(?:\??\.)([A-Z0-9_]+)/g,
];

const PATTERNS_BY_LANGUAGE: Record<string, RegExp[]> = {
  javascript: JS_TS_PATTERNS,
  typescript: JS_TS_PATTERNS,
  python: [
    /os\.(?:environ\.get|environ|getenv)\(['"]([A-Z0-9_]+)['"](?:\s*,[^)]*)?\)/g,
    /os\.environ\[['"]([A-Z0-9_]+)['"]\]/g,
  ],
  go: [
    /os\.(?:Getenv|LookupEnv)\("([A-Z0-9_]+)"\)/g,
  ],
  rust: [
    /(?:std::)?env::var\("([A-Z0-9_]+)"\)/g,
  ],
};

// shortcut: regex-based token matching; add AST parser (e.g. tree-sitter or babel) if syntax edge cases arise
export function scanFile(filePath: string, content: string): EnvUsage[] {
  const ext = path.extname(filePath).toLowerCase();
  const language = EXTENSION_LANGUAGE_MAP[ext];
  if (!language) return [];

  const patterns = PATTERNS_BY_LANGUAGE[language];
  if (!patterns) return [];

  const lines = content.split(/\r?\n/);
  const results: EnvUsage[] = [];

  let inBlockComment = false;
  let inPyDocstring = false;
  let pyDocstringQuote: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const lineNum = i + 1;

    if (language === "python") {
      if (inPyDocstring) {
        const endIdx = line.indexOf(pyDocstringQuote!);
        if (endIdx === -1) continue;
        line = line.slice(endIdx + 3);
        inPyDocstring = false;
        pyDocstringQuote = null;
      }
      line = line.replace(/"""[\s\S]*?"""/g, "").replace(/'''[\s\S]*?'''/g, "");
      const dqIdx = line.indexOf('"""');
      const sqIdx = line.indexOf("'''");
      if (dqIdx !== -1) {
        inPyDocstring = true;
        pyDocstringQuote = '"""';
        line = line.slice(0, dqIdx);
      } else if (sqIdx !== -1) {
        inPyDocstring = true;
        pyDocstringQuote = "'''";
        line = line.slice(0, sqIdx);
      }
      if (line.trim().startsWith("#")) continue;
      line = line.replace(/(?<=\s)#.*$/, "");
    } else {
      if (inBlockComment) {
        const endIdx = line.indexOf("*/");
        if (endIdx === -1) continue;
        line = line.slice(endIdx + 2);
        inBlockComment = false;
      }
      line = line.replace(/\/\*[\s\S]*?\*\//g, "");
      const startIdx = line.indexOf("/*");
      if (startIdx !== -1) {
        inBlockComment = true;
        line = line.slice(0, startIdx);
      }
      if (line.trim().startsWith("//")) continue;
      line = line.replace(/(?<!:)\/\/.*$/, "");
    }

    const lineMatches: { key: string; index: number }[] = [];
    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern)) {
        if (match[1]) {
          lineMatches.push({ key: match[1], index: match.index ?? 0 });
        }
      }
    }

    if (lineMatches.length > 0) {
      lineMatches.sort((a, b) => a.index - b.index);
      for (const { key } of lineMatches) {
        results.push({ key, file: filePath, line: lineNum, language });
      }
    }
  }

  return results;
}

export async function scanDirectory(
  dirPath: string,
  ignoreDirs: Set<string> = DEFAULT_IGNORE_DIRS
): Promise<EnvUsage[]> {
  const results: EnvUsage[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          await walk(path.join(currentDir, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext in EXTENSION_LANGUAGE_MAP) {
          const filePath = path.join(currentDir, entry.name);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            results.push(...scanFile(filePath, content));
          } catch {
            // ignore unreadable files
          }
        }
      }
    }
  }

  await walk(dirPath);
  return results;
}
