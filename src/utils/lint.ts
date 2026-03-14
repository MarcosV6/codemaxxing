import { existsSync } from "fs";
import { join, extname } from "path";
import { execSync } from "child_process";

interface LinterInfo {
  name: string;
  command: string;
}

/**
 * Detect the project linter based on config files in the working directory
 */
export function detectLinter(cwd: string): LinterInfo | null {
  // JavaScript/TypeScript — check for biome first (faster), then eslint
  if (existsSync(join(cwd, "biome.json")) || existsSync(join(cwd, "biome.jsonc"))) {
    return { name: "Biome", command: "npx biome check" };
  }
  if (
    existsSync(join(cwd, ".eslintrc")) ||
    existsSync(join(cwd, ".eslintrc.js")) ||
    existsSync(join(cwd, ".eslintrc.cjs")) ||
    existsSync(join(cwd, ".eslintrc.json")) ||
    existsSync(join(cwd, ".eslintrc.yml")) ||
    existsSync(join(cwd, "eslint.config.js")) ||
    existsSync(join(cwd, "eslint.config.mjs")) ||
    existsSync(join(cwd, "eslint.config.ts"))
  ) {
    return { name: "ESLint", command: "npx eslint" };
  }
  // Check package.json for eslint dependency as fallback
  if (existsSync(join(cwd, "package.json"))) {
    try {
      const pkg = JSON.parse(require("fs").readFileSync(join(cwd, "package.json"), "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps["@biomejs/biome"]) {
        return { name: "Biome", command: "npx biome check" };
      }
      if (allDeps["eslint"]) {
        return { name: "ESLint", command: "npx eslint" };
      }
    } catch {
      // ignore
    }
  }

  // Python — ruff (fast) or flake8/pylint
  if (existsSync(join(cwd, "ruff.toml")) || existsSync(join(cwd, ".ruff.toml"))) {
    return { name: "Ruff", command: "ruff check" };
  }
  if (existsSync(join(cwd, "pyproject.toml"))) {
    try {
      const content = require("fs").readFileSync(join(cwd, "pyproject.toml"), "utf-8");
      if (content.includes("[tool.ruff]")) {
        return { name: "Ruff", command: "ruff check" };
      }
    } catch {
      // ignore
    }
    return { name: "Ruff", command: "ruff check" };
  }

  // Rust
  if (existsSync(join(cwd, "Cargo.toml"))) {
    return { name: "Clippy", command: "cargo clippy --message-format=short --" };
  }

  // Go
  if (existsSync(join(cwd, "go.mod"))) {
    return { name: "golangci-lint", command: "golangci-lint run" };
  }

  return null;
}

/**
 * Run the linter on a specific file and return errors (or null if clean)
 */
export function runLinter(linter: LinterInfo, filePath: string, cwd: string): string | null {
  // Skip files that the linter can't handle
  const ext = extname(filePath).toLowerCase();
  const jsExts = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"]);
  const pyExts = new Set([".py", ".pyi"]);
  const rsExts = new Set([".rs"]);
  const goExts = new Set([".go"]);

  // Only lint files matching the linter's language
  if ((linter.name === "ESLint" || linter.name === "Biome") && !jsExts.has(ext)) return null;
  if (linter.name === "Ruff" && !pyExts.has(ext)) return null;
  if (linter.name === "Clippy" && !rsExts.has(ext)) return null;
  if (linter.name === "golangci-lint" && !goExts.has(ext)) return null;

  try {
    // Clippy works on the whole project, not individual files
    const command = linter.name === "Clippy"
      ? linter.command
      : `${linter.command} ${filePath}`;

    execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return null; // No errors
  } catch (e: any) {
    const output = (e.stdout || "") + (e.stderr || "");
    const trimmed = output.trim();
    if (!trimmed) return null;
    // Limit output to avoid flooding context
    const lines = trimmed.split("\n");
    if (lines.length > 30) {
      return lines.slice(0, 30).join("\n") + `\n... (${lines.length - 30} more lines)`;
    }
    return trimmed;
  }
}
