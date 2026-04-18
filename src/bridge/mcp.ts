/**
 * MCP (Model Context Protocol) client support
 * Connects to external MCP servers and exposes their tools to the LLM agent.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

// ── Types ──

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface ConnectedServer {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>;
}

// ── Config paths ──

const GLOBAL_CONFIG_DIR = join(homedir(), ".codemaxxing");
const GLOBAL_CONFIG_PATH = join(GLOBAL_CONFIG_DIR, "mcp.json");

function getProjectConfigPaths(cwd: string): string[] {
  return [
    join(cwd, ".codemaxxing", "mcp.json"),
    join(cwd, ".cursor", "mcp.json"),
    join(cwd, "opencode.json"),
  ];
}

// ── Config loading ──

function loadConfigFile(path: string): MCPConfig | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      return parsed as MCPConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function loadMCPConfig(cwd: string): MCPConfig {
  const merged: MCPConfig = { mcpServers: {} };

  // Load global config first (lower priority)
  const globalConfig = loadConfigFile(GLOBAL_CONFIG_PATH);
  if (globalConfig) {
    Object.assign(merged.mcpServers, globalConfig.mcpServers);
  }

  // Load project configs (higher priority — later overwrites earlier)
  for (const configPath of getProjectConfigPaths(cwd)) {
    const config = loadConfigFile(configPath);
    if (config) {
      Object.assign(merged.mcpServers, config.mcpServers);
    }
  }

  return merged;
}

// ── Connection management ──

const connectedServers: ConnectedServer[] = [];

export async function connectToServers(
  config: MCPConfig,
  onStatus?: (name: string, status: string) => void,
): Promise<ConnectedServer[]> {
  const entries = Object.entries(config.mcpServers);
  if (entries.length === 0) return [];

  for (const [name, serverConfig] of entries) {
    try {
      onStatus?.(name, "connecting");

      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args ?? [],
        env: { ...process.env, ...(serverConfig.env ?? {}) } as Record<string, string>,
      });

      const client = new Client({
        name: "codemaxxing",
        version: "0.3.0",
      });

      await client.connect(transport);

      // Fetch available tools
      const toolsResult = await client.listTools();
      const tools = (toolsResult.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
      }));

      const server: ConnectedServer = { name, client, transport, tools };
      connectedServers.push(server);
      onStatus?.(name, `connected (${tools.length} tools)`);
    } catch (err: any) {
      onStatus?.(name, `failed: ${err.message}`);
    }
  }

  return connectedServers;
}

export async function disconnectAll(): Promise<void> {
  for (const server of connectedServers) {
    try { await server.client.close(); } catch { /* ignore */ }
    // Explicitly close the transport too — some SDK versions don't kill the
    // child process from client.close() alone, leaving stdio subprocesses behind.
    try { await server.transport.close(); } catch { /* ignore */ }
  }
  connectedServers.length = 0;
}

export function getConnectedServers(): ConnectedServer[] {
  return connectedServers;
}

// ── Tool format conversion ──

function encodeMcpSegment(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function decodeMcpSegment(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf-8");
  } catch {
    return null;
  }
}

export function buildMCPToolName(serverName: string, toolName: string): string {
  return `mcp_${encodeMcpSegment(serverName)}__${encodeMcpSegment(toolName)}`;
}

export function getAllMCPTools(servers: ConnectedServer[]): ChatCompletionTool[] {
  const tools: ChatCompletionTool[] = [];

  for (const server of servers) {
    for (const tool of server.tools) {
      tools.push({
        type: "function",
        function: {
          name: buildMCPToolName(server.name, tool.name),
          description: `[MCP: ${server.name}] ${tool.description ?? tool.name}`,
          parameters: tool.inputSchema as any,
        },
      });
    }
  }

  return tools;
}

/**
 * Parse an MCP tool call name to extract server name and tool name.
 *
 * New format (collision-safe):
 *   mcp_<base64url(server)>__<base64url(tool)>
 *
 * Legacy format still supported for backwards compatibility:
 *   mcp_<serverName>_<toolName>
 */
export function parseMCPToolName(fullName: string): { serverName: string; toolName: string } | null {
  if (!fullName.startsWith("mcp_")) return null;
  const rest = fullName.slice(4);

  const encodedSeparator = rest.indexOf("__");
  if (encodedSeparator !== -1) {
    const serverEncoded = rest.slice(0, encodedSeparator);
    const toolEncoded = rest.slice(encodedSeparator + 2);
    const serverName = decodeMcpSegment(serverEncoded);
    const toolName = decodeMcpSegment(toolEncoded);
    if (serverName && toolName) {
      return { serverName, toolName };
    }
  }

  // Legacy fallback: find the server by matching known connected server names.
  for (const server of connectedServers) {
    const prefix = server.name + "_";
    if (rest.startsWith(prefix)) {
      return { serverName: server.name, toolName: rest.slice(prefix.length) };
    }
  }

  // Legacy final fallback: split on first underscore.
  const idx = rest.indexOf("_");
  if (idx === -1) return null;
  return { serverName: rest.slice(0, idx), toolName: rest.slice(idx + 1) };
}

// ── Tool execution ──

export async function callMCPTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const server = connectedServers.find((s) => s.name === serverName);
  if (!server) {
    return `Error: MCP server "${serverName}" not found or not connected.`;
  }

  try {
    const result = await server.client.callTool({ name: toolName, arguments: args });
    // MCP tool results have a content array
    const content = result.content;
    if (Array.isArray(content)) {
      return content
        .map((c: any) => {
          if (c.type === "text") return c.text;
          if (c.type === "image") return `[image: ${c.mimeType}]`;
          return JSON.stringify(c);
        })
        .join("\n");
    }
    return typeof content === "string" ? content : JSON.stringify(content);
  } catch (err: any) {
    return `Error calling MCP tool "${toolName}" on server "${serverName}": ${err.message}`;
  }
}

// ── Server management ──

export function addServer(name: string, config: MCPServerConfig): { ok: boolean; message: string } {
  try {
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
      mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
    }

    let existing: MCPConfig = { mcpServers: {} };
    if (existsSync(GLOBAL_CONFIG_PATH)) {
      try {
        existing = JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
        if (!existing.mcpServers) existing.mcpServers = {};
      } catch {
        existing = { mcpServers: {} };
      }
    }

    existing.mcpServers[name] = config;
    writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(existing, null, 2) + "\n", "utf-8");
    return { ok: true, message: `Added MCP server "${name}" to global config.` };
  } catch (err: any) {
    return { ok: false, message: `Failed to add server: ${err.message}` };
  }
}

export function removeServer(name: string): { ok: boolean; message: string } {
  try {
    if (!existsSync(GLOBAL_CONFIG_PATH)) {
      return { ok: false, message: `No global MCP config found.` };
    }

    const existing: MCPConfig = JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
    if (!existing.mcpServers || !existing.mcpServers[name]) {
      return { ok: false, message: `Server "${name}" not found in global config.` };
    }

    delete existing.mcpServers[name];
    writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(existing, null, 2) + "\n", "utf-8");
    return { ok: true, message: `Removed MCP server "${name}" from global config.` };
  } catch (err: any) {
    return { ok: false, message: `Failed to remove server: ${err.message}` };
  }
}

export function listServers(cwd: string): Array<{ name: string; source: string; command: string; connected: boolean; toolCount: number }> {
  const result: Array<{ name: string; source: string; command: string; connected: boolean; toolCount: number }> = [];

  // Gather from global config
  const globalConfig = loadConfigFile(GLOBAL_CONFIG_PATH);
  if (globalConfig) {
    for (const [name, cfg] of Object.entries(globalConfig.mcpServers)) {
      const connected = connectedServers.find((s) => s.name === name);
      result.push({
        name,
        source: "global",
        command: `${cfg.command} ${(cfg.args ?? []).join(" ")}`.trim(),
        connected: !!connected,
        toolCount: connected?.tools.length ?? 0,
      });
    }
  }

  // Gather from project configs
  for (const configPath of getProjectConfigPaths(cwd)) {
    const config = loadConfigFile(configPath);
    if (config) {
      const source = configPath.includes(".cursor") ? "cursor" : configPath.includes("opencode") ? "opencode" : "project";
      for (const [name, cfg] of Object.entries(config.mcpServers)) {
        // Skip if already listed from global (project overrides)
        const existing = result.find((r) => r.name === name);
        if (existing) {
          existing.source = source;
          existing.command = `${cfg.command} ${(cfg.args ?? []).join(" ")}`.trim();
          continue;
        }
        const connected = connectedServers.find((s) => s.name === name);
        result.push({
          name,
          source,
          command: `${cfg.command} ${(cfg.args ?? []).join(" ")}`.trim(),
          connected: !!connected,
          toolCount: connected?.tools.length ?? 0,
        });
      }
    }
  }

  return result;
}
