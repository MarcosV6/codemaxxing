import React from "react";
import { Box, Text } from "ink";
import type { AgentTask } from "../utils/task-tracker.js";
import type { Theme } from "../themes.js";

interface TaskListProps {
  tasks: AgentTask[];
  colors: Theme["colors"];
}

export function TaskList({ tasks, colors }: TaskListProps) {
  if (tasks.length === 0) return null;

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={0} marginBottom={0}>
      {tasks.map((task, idx) => {
        let icon: string;
        let iconColor: string;
        let labelColor: string;
        let isBold = false;

        switch (task.status) {
          case "completed":
            icon = "\u2714";
            iconColor = colors.success;
            labelColor = colors.muted;
            break;
          case "in_progress":
            icon = "\u25A0";
            iconColor = colors.warning;
            labelColor = colors.text || "#FFFFFF";
            isBold = true;
            break;
          case "pending":
          default:
            icon = "\u25A1";
            iconColor = colors.muted;
            labelColor = colors.muted;
            break;
        }

        // Indentation: nested under a parent feel
        const indent = idx === 0 ? "\u2514\u2500 " : "   ";
        const label = task.status === "in_progress" && task.activeLabel
          ? task.activeLabel
          : task.label;

        return (
          <Text key={task.id}>
            <Text color={colors.muted}>{indent}</Text>
            <Text color={iconColor}>{icon} </Text>
            <Text color={labelColor} bold={isBold}>{label}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
