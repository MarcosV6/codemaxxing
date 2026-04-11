import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export interface TestRunnerInfo {
  name: string;
  command: string;
}

/**
 * Detect the project's test runner based on config files
 */
export function detectTestRunner(cwd: string): TestRunnerInfo | null {
  // Check package.json for test script first (most reliable)
  if (existsSync(join(cwd, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        // Detect specific runners from the script
        const testScript = pkg.scripts.test;
        if (testScript.includes("vitest")) return { name: "Vitest", command: "npx vitest run" };
        if (testScript.includes("jest")) return { name: "Jest", command: "npx jest" };
        if (testScript.includes("mocha")) return { name: "Mocha", command: "npx mocha" };
        if (testScript.includes("ava")) return { name: "AVA", command: "npx ava" };
        // Use npm test as fallback
        return { name: "npm test", command: "npm test" };
      }
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps["vitest"]) return { name: "Vitest", command: "npx vitest run" };
      if (allDeps["jest"]) return { name: "Jest", command: "npx jest" };
      if (allDeps["mocha"]) return { name: "Mocha", command: "npx mocha" };
    } catch {
      // ignore
    }
  }

  // Python — pytest
  if (existsSync(join(cwd, "pytest.ini")) || existsSync(join(cwd, "setup.cfg")) || existsSync(join(cwd, "conftest.py"))) {
    return { name: "pytest", command: "pytest" };
  }
  if (existsSync(join(cwd, "pyproject.toml"))) {
    try {
      const content = readFileSync(join(cwd, "pyproject.toml"), "utf-8");
      if (content.includes("[tool.pytest]") || content.includes("pytest")) {
        return { name: "pytest", command: "pytest" };
      }
    } catch { /* ignore */ }
  }

  // Rust
  if (existsSync(join(cwd, "Cargo.toml"))) {
    return { name: "cargo test", command: "cargo test" };
  }

  // Go
  if (existsSync(join(cwd, "go.mod"))) {
    return { name: "go test", command: "go test ./..." };
  }

  return null;
}

/**
 * Run the test suite and return output. Returns null if tests pass.
 */
export function runTests(runner: TestRunnerInfo, cwd: string): { passed: boolean; output: string } {
  try {
    const output = execSync(runner.command, {
      cwd,
      encoding: "utf-8",
      timeout: 60000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { passed: true, output: output.trim() || "All tests passed." };
  } catch (e: any) {
    const output = ((e.stdout || "") + (e.stderr || "")).trim();
    const lines = output.split("\n");
    const limited = lines.length > 50 ? lines.slice(0, 50).join("\n") + `\n... (${lines.length - 50} more lines)` : output;
    return { passed: false, output: limited || "Tests failed (no output)." };
  }
}
