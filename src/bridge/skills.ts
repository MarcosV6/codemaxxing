import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { REGISTRY, type RegistrySkill } from "../skills/registry.js";

const SKILLS_DIR = join(homedir(), ".codemaxxing", "skills");

export interface SkillMeta {
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
}

/**
 * Ensure the skills directory exists
 */
function ensureSkillsDir(): void {
  if (!existsSync(SKILLS_DIR)) {
    mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

/**
 * List all installed skills by scanning ~/.codemaxxing/skills/
 */
export function listInstalledSkills(): SkillMeta[] {
  ensureSkillsDir();
  const skills: SkillMeta[] = [];

  try {
    const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = join(SKILLS_DIR, entry.name, "skill.json");
      if (!existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
        skills.push({
          name: meta.name ?? entry.name,
          description: meta.description ?? "",
          version: meta.version ?? "0.0.0",
          author: meta.author ?? "unknown",
          tags: meta.tags ?? [],
        });
      } catch {
        // skip malformed skill.json
      }
    }
  } catch {
    // directory doesn't exist or can't be read
  }

  return skills;
}

/**
 * Install a skill from the built-in registry
 */
export function installSkill(name: string): { ok: boolean; message: string } {
  const skill = REGISTRY.find((s) => s.name === name);
  if (!skill) {
    return { ok: false, message: `Skill "${name}" not found in registry` };
  }

  ensureSkillsDir();
  const skillDir = join(SKILLS_DIR, name);

  if (existsSync(skillDir)) {
    return { ok: false, message: `Skill "${name}" is already installed` };
  }

  mkdirSync(skillDir, { recursive: true });
  mkdirSync(join(skillDir, "examples"), { recursive: true });

  // Write skill.json
  const meta: SkillMeta = {
    name: skill.name,
    description: skill.description,
    version: skill.version,
    author: skill.author,
    tags: skill.tags,
  };
  writeFileSync(join(skillDir, "skill.json"), JSON.stringify(meta, null, 2));

  // Write prompt.md
  writeFileSync(join(skillDir, "prompt.md"), skill.prompt);

  return { ok: true, message: `Installed skill: ${skill.name}` };
}

/**
 * Remove an installed skill
 */
export function removeSkill(name: string): { ok: boolean; message: string } {
  const skillDir = join(SKILLS_DIR, name);
  if (!existsSync(skillDir)) {
    return { ok: false, message: `Skill "${name}" is not installed` };
  }

  rmSync(skillDir, { recursive: true, force: true });
  return { ok: true, message: `Removed skill: ${name}` };
}

/**
 * Get the prompt.md content for an installed skill
 */
export function getSkillPrompt(name: string): string | null {
  const promptPath = join(SKILLS_DIR, name, "prompt.md");
  if (!existsSync(promptPath)) return null;
  return readFileSync(promptPath, "utf-8");
}

/**
 * Get examples from a skill's examples/ directory
 */
function getSkillExamples(name: string): string[] {
  const examplesDir = join(SKILLS_DIR, name, "examples");
  if (!existsSync(examplesDir)) return [];

  try {
    return readdirSync(examplesDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => readFileSync(join(examplesDir, f), "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Get skills that should be active for the given project directory.
 * If .codemaxxing/skills.json exists in the project, only those skills are active.
 * Otherwise, all installed skills are active.
 */
export function getActiveSkills(cwd: string, sessionDisabled: Set<string> = new Set()): string[] {
  const installed = listInstalledSkills().map((s) => s.name);
  let active: string[];

  const projectConfig = join(cwd, ".codemaxxing", "skills.json");
  if (existsSync(projectConfig)) {
    try {
      const config = JSON.parse(readFileSync(projectConfig, "utf-8"));
      const projectSkills: string[] = config.skills ?? [];
      // Only include project skills that are actually installed
      active = projectSkills.filter((s) => installed.includes(s));
    } catch {
      active = installed;
    }
  } else {
    active = installed;
  }

  // Filter out session-disabled skills
  return active.filter((s) => !sessionDisabled.has(s));
}

/**
 * Build the skill prompt blocks to inject into the system prompt
 */
export function buildSkillPrompts(cwd: string, sessionDisabled: Set<string> = new Set()): string {
  const activeSkills = getActiveSkills(cwd, sessionDisabled);
  if (activeSkills.length === 0) return "";

  const blocks: string[] = [];
  for (const name of activeSkills) {
    const prompt = getSkillPrompt(name);
    if (!prompt) continue;

    blocks.push(`\n--- Skill: ${name} ---`);
    blocks.push(prompt.trim());

    // Include examples if any
    const examples = getSkillExamples(name);
    for (const example of examples) {
      blocks.push(`\n### Example:\n${example.trim()}`);
    }

    blocks.push(`--- End Skill ---`);
  }

  return blocks.join("\n");
}

/**
 * Create a scaffold for a new custom skill
 */
export function createSkillScaffold(name: string): { ok: boolean; message: string; path?: string } {
  ensureSkillsDir();
  const skillDir = join(SKILLS_DIR, name);

  if (existsSync(skillDir)) {
    return { ok: false, message: `Skill "${name}" already exists` };
  }

  mkdirSync(skillDir, { recursive: true });
  mkdirSync(join(skillDir, "examples"), { recursive: true });

  const meta: SkillMeta = {
    name,
    description: "A custom skill",
    version: "1.0.0",
    author: "you",
    tags: [],
  };
  writeFileSync(join(skillDir, "skill.json"), JSON.stringify(meta, null, 2));

  writeFileSync(
    join(skillDir, "prompt.md"),
    `# ${name}\n\nAdd your skill prompt here. This content will be injected into the system prompt.\n\n## Guidelines\n- Be specific and actionable\n- Include best practices\n- List anti-patterns to avoid\n`,
  );

  return { ok: true, message: `Created skill scaffold: ${name}`, path: skillDir };
}

/**
 * Search the built-in registry by name, tags, or description
 */
export function searchRegistry(query: string): RegistrySkill[] {
  const q = query.toLowerCase();
  return REGISTRY.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

/**
 * Return all skills from the built-in registry
 */
export function getRegistrySkills(): RegistrySkill[] {
  return REGISTRY;
}

/**
 * Get the count of active skills
 */
export function getActiveSkillCount(cwd: string, sessionDisabled: Set<string> = new Set()): number {
  return getActiveSkills(cwd, sessionDisabled).length;
}
