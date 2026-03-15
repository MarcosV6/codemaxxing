import React from "react";
import { Box, Text } from "ink";
import type { CodingAgent } from "../agent.js";
import { getActiveSkillCount } from "../utils/skills.js";

interface StatusBarProps {
  agent: CodingAgent;
  modelName: string;
  sessionDisabledSkills: Set<string>;
}

export function StatusBar({ agent, modelName, sessionDisabledSkills }: StatusBarProps) {
  const tokens = agent.estimateTokens();
  const tokenStr = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
  const { totalCost } = agent.getCostInfo();
  const costStr = totalCost > 0
    ? ` · 💰 $${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2)}`
    : "";
  const count = getActiveSkillCount(process.cwd(), sessionDisabledSkills);
  const skillsStr = count > 0 ? ` · 🧠 ${count} skill${count !== 1 ? "s" : ""}` : "";
  const architectStr = agent.getArchitectModel() ? " · 🏗️ architect" : "";

  return (
    <Box paddingX={2}>
      <Text dimColor>
        {"💬 "}{agent.getContextLength()}{" messages · ~"}{tokenStr}{" tokens"}
        {costStr}
        {modelName ? ` · 🤖 ${modelName}` : ""}
        {skillsStr}
        {architectStr}
      </Text>
    </Box>
  );
}
