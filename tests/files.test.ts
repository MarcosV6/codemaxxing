import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { executeTool, getShellFileWriteGuardReason } from "../src/tools/files.js";

const TMP = join(import.meta.dirname, "__tmp_files_test__");

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("edit_file", () => {
  it("replaces exact text in a file", async () => {
    writeFileSync(join(TMP, "test.ts"), "const foo = 1;\nconst bar = 2;\n");
    const result = await executeTool("edit_file", { path: "test.ts", oldText: "const foo = 1;", newText: "const foo = 99;" }, TMP);
    expect(result).toContain("✅");
    const { readFileSync } = await import("fs");
    const content = readFileSync(join(TMP, "test.ts"), "utf-8");
    expect(content).toContain("const foo = 99;");
    expect(content).toContain("const bar = 2;");
  });

  it("returns error when exact text not found", async () => {
    writeFileSync(join(TMP, "test.ts"), "const foo = 1;\n");
    const result = await executeTool("edit_file", { path: "test.ts", oldText: "does not exist", newText: "x" }, TMP);
    expect(result).toContain("Error");
  });

  it("replaces all occurrences when replaceAll is true", async () => {
    writeFileSync(join(TMP, "test.ts"), "const x = 1;\nconst x = 1;\n");
    const result = await executeTool("edit_file", { path: "test.ts", oldText: "const x = 1;", newText: "const x = 2;", replaceAll: true }, TMP);
    expect(result).toContain("2 replacement");
  });

  it("replaces only first occurrence by default", async () => {
    writeFileSync(join(TMP, "test.ts"), "const x = 1;\nconst x = 1;\n");
    await executeTool("edit_file", { path: "test.ts", oldText: "const x = 1;", newText: "const x = 2;" }, TMP);
    const { readFileSync } = await import("fs");
    const content = readFileSync(join(TMP, "test.ts"), "utf-8");
    const matches = (content.match(/const x = 2;/g) || []).length;
    expect(matches).toBe(1);
  });
});

describe("write_file", () => {
  it("creates parent directories automatically", async () => {
    const result = await executeTool("write_file", { path: "deep/nested/dir/test.ts", content: "hello" }, TMP);
    expect(result).toContain("✅");
    expect(existsSync(join(TMP, "deep/nested/dir/test.ts"))).toBe(true);
  });

  it("expands ~ before enforcing project-root safety", async () => {
    const result = await executeTool("write_file", { path: "~/outside-project/test.ts", content: "hello" }, TMP);
    expect(result).toContain("Path escapes project root");
  });
});

describe("run_command safeguards", () => {
  it("blocks shell-based source file scaffolding", async () => {
    const result = await executeTool("run_command", {
      command: "cat > src/main.tsx <<'EOF'\nconsole.log('hi');\nEOF",
    }, TMP);
    expect(result).toContain("Blocked:");
    expect(result).toContain("write_file");
  });

  it("allows normal build/test style commands", () => {
    const result = getShellFileWriteGuardReason("npm run build > build.log");
    expect(result).toBeNull();
  });
});
