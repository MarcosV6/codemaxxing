import React from "react";
import { Text, Box } from "ink";

interface MarkdownTextProps {
  text: string;
  colors: {
    response: string;
    secondary: string;
    muted: string;
    primary: string;
    [key: string]: string;
  };
}

/**
 * Render markdown-formatted text in the terminal.
 * Handles: headers, bold, italic, code blocks, inline code, lists, horizontal rules.
 */
export function MarkdownText({ text, colors }: MarkdownTextProps) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start/end
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End code block — render with clean styling
        const maxLineLen = Math.max(...codeBlockLines.map(l => l.length), 0);
        const boxWidth = Math.max(maxLineLen + 4, (codeBlockLang || "code").length + 6, 30);
        elements.push(
          <Box key={`cb-${i}`} flexDirection="column" marginLeft={1} marginTop={0} marginBottom={0}>
            <Text color={colors.muted}>{`  \u256d\u2500 ${codeBlockLang || "code"} ${"─".repeat(Math.max(0, boxWidth - (codeBlockLang || "code").length - 4))}\u256e`}</Text>
            {codeBlockLines.map((cl, j) => (
              <Text key={j} color={colors.muted}>{`  \u2502 `}<Text color={colors.secondary}>{cl}</Text></Text>
            ))}
            <Text color={colors.muted}>{`  \u2570${"─".repeat(boxWidth)}╯`}</Text>
          </Box>
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = "";
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Blank lines
    if (!line.trim()) {
      elements.push(<Text key={i}> </Text>);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      elements.push(<Text key={i} color={colors.muted}>{"  "}{"─".repeat(40)}</Text>);
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(
        <Text key={i}>
          <Text color={colors.muted}>{"  ### "}</Text>
          <Text bold color={colors.secondary}>{line.slice(4)}</Text>
        </Text>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <Text key={i}>
          <Text color={colors.muted}>{"  ## "}</Text>
          <Text bold color={colors.primary}>{line.slice(3)}</Text>
        </Text>
      );
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <Text key={i}>
          <Text color={colors.muted}>{"  # "}</Text>
          <Text bold underline color={colors.primary}>{line.slice(2)}</Text>
        </Text>
      );
      continue;
    }

    // Bullet lists
    if (/^\s*[-*+]\s/.test(line)) {
      const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      const content = line.replace(/^\s*[-*+]\s/, "");
      const depth = Math.floor(indent / 2);
      const bullet = depth === 0 ? "●" : depth === 1 ? "○" : "·";
      elements.push(
        <Text key={i} wrap="wrap">
          {"  "}{"  ".repeat(depth + 1)}<Text color={colors.primary}>{bullet}</Text>{" "}{renderInline(content, colors)}
        </Text>
      );
      continue;
    }

    // Numbered lists
    if (/^\s*\d+\.\s/.test(line)) {
      const match = line.match(/^(\s*)(\d+)\.\s(.*)/);
      if (match) {
        const indent = match[1].length;
        const num = match[2];
        const content = match[3];
        elements.push(
          <Text key={i} wrap="wrap">
            {"  "}{"  ".repeat(Math.floor(indent / 2) + 1)}<Text color={colors.primary}>{num}.</Text>{" "}{renderInline(content, colors)}
          </Text>
        );
        continue;
      }
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      elements.push(
        <Text key={i} wrap="wrap">
          {"  "}<Text color={colors.primary}>{"▌ "}</Text><Text color={colors.muted} italic>{renderInline(line.slice(2), colors)}</Text>
        </Text>
      );
      continue;
    }

    // Regular paragraph with inline formatting
    elements.push(
      <Text key={i} wrap="wrap">{"  "}{renderInline(line, colors)}</Text>
    );
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <Box key="cb-unclosed" flexDirection="column" marginLeft={1}>
        <Text color={colors.muted}>{`  ╭─ ${codeBlockLang || "code"} ${"─".repeat(Math.max(0, 30 - (codeBlockLang || "code").length))}╮`}</Text>
        {codeBlockLines.map((cl, j) => (
          <Text key={j} color={colors.muted}>{`  │ `}<Text color={colors.secondary}>{cl}</Text></Text>
        ))}
      </Box>
    );
  }

  return <Box flexDirection="column">{elements}</Box>;
}

/**
 * Render inline markdown: **bold**, *italic*, `code`, ~~strikethrough~~
 */
function renderInline(text: string, colors: { muted: string; secondary: string; primary: string; [key: string]: string }): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(<Text key={key++} color={colors.secondary}>{`\`${codeMatch[1]}\``}</Text>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<Text key={key++} bold color={colors.primary}>{boldMatch[1]}</Text>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<Text key={key++} italic>{italicMatch[1]}</Text>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Strikethrough
    const strikeMatch = remaining.match(/^~~([^~]+)~~/);
    if (strikeMatch) {
      parts.push(<Text key={key++} strikethrough>{strikeMatch[1]}</Text>);
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Plain text (up to next special char)
    const nextSpecial = remaining.search(/[`*~]/);
    if (nextSpecial === -1) {
      parts.push(<Text key={key++}>{remaining}</Text>);
      break;
    } else if (nextSpecial === 0) {
      // Special char that didn't match a pattern — output it literally
      parts.push(<Text key={key++}>{remaining[0]}</Text>);
      remaining = remaining.slice(1);
    } else {
      parts.push(<Text key={key++}>{remaining.slice(0, nextSpecial)}</Text>);
      remaining = remaining.slice(nextSpecial);
    }
  }

  return <>{parts}</>;
}
