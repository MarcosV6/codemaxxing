import { existsSync, readFileSync } from "fs";
import { join, relative } from "path";

/**
 * Load .codemaxxingignore patterns from project root.
 * Returns a function that tests if a relative path should be ignored.
 */
export function loadIgnorePatterns(cwd: string): (relativePath: string) => boolean {
  const ignoreFile = join(cwd, ".codemaxxingignore");
  if (!existsSync(ignoreFile)) {
    return () => false;
  }

  try {
    const content = readFileSync(ignoreFile, "utf-8");
    const patterns = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    if (patterns.length === 0) return () => false;

    // Convert glob-like patterns to regex
    const regexes = patterns.map((pattern) => {
      // Handle negation
      const negate = pattern.startsWith("!");
      const pat = negate ? pattern.slice(1) : pattern;

      // Convert glob to regex
      let regex = pat
        .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex chars
        .replace(/\*\*/g, "{{GLOBSTAR}}") // placeholder for **
        .replace(/\*/g, "[^/]*") // * matches non-slash
        .replace(/\?/g, "[^/]") // ? matches single non-slash
        .replace(/{{GLOBSTAR}}/g, ".*"); // ** matches anything

      // If pattern ends with /, match directory and contents
      if (regex.endsWith("/")) {
        regex = regex + ".*";
      }

      // If pattern doesn't start with /, match anywhere in path
      if (!pat.startsWith("/")) {
        regex = "(^|/)" + regex;
      } else {
        regex = "^" + regex.slice(1); // remove leading /
      }

      return { regex: new RegExp(regex), negate };
    });

    return (relativePath: string) => {
      let ignored = false;
      for (const { regex, negate } of regexes) {
        if (regex.test(relativePath)) {
          ignored = !negate;
        }
      }
      return ignored;
    };
  } catch {
    return () => false;
  }
}

/**
 * Check if .codemaxxingignore exists in the project
 */
export function hasIgnoreFile(cwd: string): boolean {
  return existsSync(join(cwd, ".codemaxxingignore"));
}
