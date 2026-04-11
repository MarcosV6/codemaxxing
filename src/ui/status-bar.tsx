import React from "react";
import { Box, Text } from "ink";
import type { CodingAgent } from "../agent.js";
import { getActiveSkillCount } from "../bridge/skills.js";
import { formatContextSize } from "../utils/model-context.js";

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
    ? `$${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2)}`
    : "";
  const count = getActiveSkillCount(process.cwd(), sessionDisabledSkills);
  const architectMode = !!agent.getArchitectModel();
  const isLocal = agent.isLocalProvider();
  const tps = agent.getLastTokensPerSecond();
  const tpsStr = isLocal && tps !== null && tps > 0
    ? (tps >= 100 ? tps.toFixed(0) : tps.toFixed(1))
    : null;

  // Token gauge — fills relative to the actual detected context window for
  // the active model. Falls back to 128k only when detection hasn't produced
  // anything yet (brief window at startup / on model switch).
  const detectedWindow = agent.getContextWindow();
  const maxTokens = detectedWindow && detectedWindow > 0 ? detectedWindow : 128000;
  const usage = Math.min(tokens / maxTokens, 1);
  const gaugeWidth = 8;
  const filled = Math.round(usage * gaugeWidth);
  const gaugeColor = usage < 0.5 ? "#50FA7B" : usage < 0.8 ? "#FFB86C" : "#FF5555";
  const gauge = "\u2588".repeat(filled) + "\u2591".repeat(gaugeWidth - filled);
  // When we actually detected a window, show `used/total` so headroom is
  // legible at a glance. Otherwise fall back to the old `~Nk tok` display.
  const tokenDisplay = detectedWindow
    ? `~${tokenStr}/${formatContextSize(detectedWindow)}`
    : `~${tokenStr} tok`;

  return (
    <Box paddingX={2} marginTop={0}>
      <Text color="#555555">{"\u2500".repeat(2)} </Text>
      <Text color={gaugeColor}>{gauge}</Text>
      <Text color="#555555">{" "}{agent.getContextLength()} msgs</Text>
      <Text color="#555555">{" \u00b7 "}</Text>
      <Text color="#555555">{tokenDisplay}</Text>
      {costStr ? (
        <>
          <Text color="#555555">{" \u00b7 "}</Text>
          <Text color="#888888">{costStr}</Text>
        </>
      ) : null}
      {modelName ? (
        <>
          <Text color="#555555">{" \u00b7 "}</Text>
          <Text color="#888888">{modelName}</Text>
        </>
      ) : null}
      {tpsStr ? (
        <>
          <Text color="#555555">{" \u00b7 "}</Text>
          <Text color="#50FA7B">{tpsStr} tok/s</Text>
        </>
      ) : null}
      {count > 0 ? (
        <>
          <Text color="#555555">{" \u00b7 "}</Text>
          <Text color="#888888">{count} skill{count !== 1 ? "s" : ""}</Text>
        </>
      ) : null}
      {architectMode ? (
        <>
          <Text color="#555555">{" \u00b7 "}</Text>
          <Text color="#FFB86C">architect</Text>
        </>
      ) : null}
    </Box>
  );
}
