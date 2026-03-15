import { describe, expect, it } from "vitest";
import { buildMCPToolName, parseMCPToolName } from "../src/utils/mcp.js";

describe("MCP tool naming", () => {
  it("round-trips names safely even with underscores", () => {
    const fullName = buildMCPToolName("my_server_name", "tool_with_parts");
    expect(parseMCPToolName(fullName)).toEqual({
      serverName: "my_server_name",
      toolName: "tool_with_parts",
    });
  });

  it("still supports the legacy format", () => {
    expect(parseMCPToolName("mcp_server_tool")).toEqual({
      serverName: "server",
      toolName: "tool",
    });
  });
});
