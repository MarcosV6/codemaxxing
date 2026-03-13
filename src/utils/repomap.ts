import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", ".next", "__pycache__", ".pytest_cache",
  "target", "build", "out", ".cache", ".parcel-cache", ".nuxt", ".svelte-kit",
  "vendor", "venv", ".venv", "env", ".env", "coverage", ".nyc_output",
]);

const IGNORE_FILES = new Set([
  ".DS_Store", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
]);

const MAX_FILE_SIZE = 100 * 1024;
const MAX_MAP_SIZE = 15 * 1024;

// ── Per-line regex patterns (no /g flag!) ──

interface LangPatterns {
  patterns: Array<{ kind: string; regex: RegExp; format: (m: RegExpMatchArray) => string }>;
}

const LANGS: Record<string, LangPatterns> = {
  javascript: {
    patterns: [
      { kind: "fn", regex: /^(?:export\s+)?(?:export\s+default\s+)?(?:async\s+)?function\s+(\w+)\s*\(/, format: (m) => `function ${m[1]}(...)` },
      { kind: "arrow", regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/, format: (m) => `const ${m[1]} = (...)` },
      { kind: "cls", regex: /^(?:export\s+)?(?:export\s+default\s+)?class\s+(\w+)/, format: (m) => `class ${m[1]}` },
    ],
  },
  typescript: {
    patterns: [
      { kind: "fn", regex: /^(?:export\s+)?(?:export\s+default\s+)?(?:async\s+)?function\s+(\w+)/, format: (m) => `function ${m[1]}(...)` },
      { kind: "arrow", regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/, format: (m) => `const ${m[1]} = (...)` },
      { kind: "cls", regex: /^(?:export\s+)?(?:export\s+default\s+)?class\s+(\w+)/, format: (m) => `class ${m[1]}` },
      { kind: "iface", regex: /^(?:export\s+)?interface\s+(\w+)/, format: (m) => `interface ${m[1]}` },
      { kind: "type", regex: /^(?:export\s+)?type\s+(\w+)\s*[=<]/, format: (m) => `type ${m[1]}` },
      { kind: "enum", regex: /^(?:export\s+)?enum\s+(\w+)/, format: (m) => `enum ${m[1]}` },
    ],
  },
  python: {
    patterns: [
      { kind: "fn", regex: /^def\s+(\w+)\s*\(/, format: (m) => `def ${m[1]}(...)` },
      { kind: "method", regex: /^\s{2,}def\s+(\w+)\s*\(/, format: (m) => `  def ${m[1]}(...)` },
      { kind: "cls", regex: /^class\s+(\w+)/, format: (m) => `class ${m[1]}` },
    ],
  },
  go: {
    patterns: [
      { kind: "fn", regex: /^func\s+(\w+)\s*\(/, format: (m) => `func ${m[1]}(...)` },
      { kind: "method", regex: /^func\s+\((\w+)\s+\*?(\w+)\)\s+(\w+)\s*\(/, format: (m) => `func (${m[2]}) ${m[3]}(...)` },
      { kind: "struct", regex: /^type\s+(\w+)\s+struct/, format: (m) => `type ${m[1]} struct` },
      { kind: "iface", regex: /^type\s+(\w+)\s+interface/, format: (m) => `type ${m[1]} interface` },
    ],
  },
  rust: {
    patterns: [
      { kind: "fn", regex: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, format: (m) => `fn ${m[1]}(...)` },
      { kind: "struct", regex: /^(?:pub\s+)?struct\s+(\w+)/, format: (m) => `struct ${m[1]}` },
      { kind: "enum", regex: /^(?:pub\s+)?enum\s+(\w+)/, format: (m) => `enum ${m[1]}` },
      { kind: "trait", regex: /^(?:pub\s+)?trait\s+(\w+)/, format: (m) => `trait ${m[1]}` },
      { kind: "impl", regex: /^impl(?:<[^>]*>)?\s+(?:(\w+)\s+for\s+)?(\w+)/, format: (m) => m[1] ? `impl ${m[1]} for ${m[2]}` : `impl ${m[2]}` },
      { kind: "mod", regex: /^(?:pub\s+)?mod\s+(\w+)/, format: (m) => `mod ${m[1]}` },
    ],
  },
};

/**
 * Get language from extension
 */
function getLang(ext: string): string | null {
  const map: Record<string, string> = {
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
  };
  return map[ext.toLowerCase()] || null;
}

/**
 * Extract signatures from file content
 */
function extractSignatures(content: string, lang: string): string[] {
  const sigs: string[] = [];
  const langDef = LANGS[lang];
  if (!langDef) return sigs;

  const lines = content.split("\n");
  const seen = new Set<string>();

  for (const line of lines) {
    for (const pattern of langDef.patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const sig = pattern.format(match);
        if (!seen.has(sig)) {
          seen.add(sig);
          sigs.push(sig);
        }
        break; // Only match one pattern per line
      }
    }
  }

  return sigs;
}

/**
 * Scan directory for supported files
 */
function getFiles(cwd: string): string[] {
  const files: string[] = [];

  function walk(dir: string, depth: number) {
    if (depth > 5) return;
    try {
      for (const entry of readdirSync(dir)) {
        if (IGNORE_FILES.has(entry) || entry.startsWith(".")) continue;
        if (IGNORE_DIRS.has(entry)) continue;
        const full = join(dir, entry);

        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full, depth + 1);
        } else if (stat.isFile() && stat.size < MAX_FILE_SIZE) {
          if (getLang(extname(entry))) files.push(full);
        }
      }
    } catch { /* skip */ }
  }

  walk(cwd, 0);
  return files;
}

// ── Cache ──
let cachedMap = "";
let cachedCwd = "";
let cachedTime = 0;
const CACHE_TTL = 60_000;

/**
 * Build the repo map — cached for 1 min
 */
export async function buildRepoMap(cwd: string): Promise<string> {
  const now = Date.now();
  if (cachedMap && cachedCwd === cwd && now - cachedTime < CACHE_TTL) {
    return cachedMap;
  }

  const files = getFiles(cwd);
  const lines: string[] = [];

  for (const file of files) {
    const ext = extname(file);
    const lang = getLang(ext);
    if (!lang) continue;

    try {
      const content = readFileSync(file, "utf-8");
      const sigs = extractSignatures(content, lang);

      if (sigs.length > 0) {
        const relPath = relative(cwd, file);
        lines.push(`${relPath}:`);
        for (const sig of sigs) {
          lines.push(`  ${sig}`);
        }
        lines.push("");

        // Size guard
        if (lines.join("\n").length > MAX_MAP_SIZE) {
          lines.push(`... (truncated)`);
          break;
        }
      }
    } catch { /* skip */ }
  }

  const map = lines.length > 0 ? lines.join("\n") : "(no signatures found)";

  cachedMap = map;
  cachedCwd = cwd;
  cachedTime = now;

  return map;
}

/**
 * Get cached map without rebuilding
 */
export function getCachedMap(): string {
  return cachedMap;
}

/**
 * Clear the cache
 */
export function clearMapCache(): void {
  cachedMap = "";
  cachedCwd = "";
  cachedTime = 0;
}

/**
 * Check if file is supported
 */
export function isSupportedFile(filePath: string): boolean {
  return !!getLang(extname(filePath).toLowerCase());
}

export function getSupportedExtensions(): string[] {
  return [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".go", ".rs"];
}

export function getLanguageForExt(ext: string): string | null {
  return getLang(ext);
}
