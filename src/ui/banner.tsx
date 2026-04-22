import React from "react";
import os from "os";
import path from "path";
import { Box, Text } from "ink";
import type { Theme } from "../themes.js";

// "codemaxxing" rendered in the figlet "Slant" font. All lines padded to the same
// width (64) so the per-character gradient stays vertically aligned.
const LOGO_LINES = [
  "                  __                               _            ",
  "  _________  ____/ /__  ____ ___  ____ __  ___  __(_)___  ____ _",
  " / ___/ __ \\/ __  / _ \\/ __ `__ \\/ __ `/ |/_/ |/_/ / __ \\/ __ `/",
  "/ /__/ /_/ / /_/ /  __/ / / / / / /_/ />  <_>  </ / / / / /_/ / ",
  "\\___/\\____/\\__,_/\\___/_/ /_/ /_/\\__,_/_/|_/_/|_/_/_/ /_/\\__, /  ",
  "                                                       /____/   ",
];

/**
 * Interpolate between two hex colors.
 * t=0 gives color1, t=1 gives color2.
 */
function lerpColor(hex1: string, hex2: string, t: number): string {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const isHexColor = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);

/**
 * Render a line of text with a horizontal gradient between two colors.
 * If either color isn't a hex value (e.g., named colors like "cyan"), falls back
 * to rendering the whole line in `color1` since lerping requires RGB components.
 */
function GradientLine({ text, color1, color2, bold: isBold }: { text: string; color1: string; color2: string; bold?: boolean }) {
  if (!isHexColor(color1) || !isHexColor(color2)) {
    return <Text color={color1} bold={isBold}>{text}</Text>;
  }
  // Per-character gradient — keeps individual glyphs crisp instead of cutting them
  // mid-character the way larger chunks do.
  const chars: React.ReactNode[] = [];
  const denom = Math.max(text.length - 1, 1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") {
      chars.push(<Text key={i}> </Text>);
      continue;
    }
    const color = lerpColor(color1, color2, i / denom);
    chars.push(<Text key={i} color={color} bold={isBold}>{ch}</Text>);
  }
  return <Text>{chars}</Text>;
}

interface BannerProps {
  version: string;
  colors: Theme["colors"];
  width?: number;
}

const LOGO_WIDTH = 64;

export function prettyCwd(cwd: string = process.cwd()): string {
  const home = os.homedir();
  if (cwd === home) return "~";
  if (cwd.startsWith(home + path.sep)) return "~" + cwd.slice(home.length);
  return cwd;
}

export const Banner = React.memo(function Banner({ version, colors, width = 80 }: BannerProps) {
  // Theme primary → secondary gradient. GradientLine itself handles non-hex
  // theme colors by rendering a flat color, so we just pass them through.
  const c1 = colors.primary;
  const c2 = colors.secondary;
  const cwd = prettyCwd();
  const showLogo = width >= LOGO_WIDTH + 4;
  const separatorWidth = Math.max(12, Math.min(58, Math.max(0, width - 4)));

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={0}>
      <Text> </Text>
      {showLogo && LOGO_LINES.map((line, i) => (
        <Text key={`c${i}`}>{"  "}<GradientLine text={line} color1={c1} color2={c2} bold /></Text>
      ))}
      {showLogo && <Text> </Text>}
      <Text>
        {"  "}
        <Text color={colors.muted}>{"v" + version}</Text>
        <Text color={colors.muted}>{" \u2502 "}</Text>
        <Text color={c1} bold>your code</Text>
        <Text color={colors.muted}>{" \u00b7 "}</Text>
        <Text color={c2} bold>your model</Text>
        <Text color={colors.muted}>{" \u00b7 "}</Text>
        <Text dimColor>no excuses</Text>
      </Text>
      <Text>
        {"  "}
        <Text color={colors.muted}>{"\u25b8 "}</Text>
        <Text color={colors.muted}>{cwd}</Text>
      </Text>
      <Text color={colors.muted}>{"  "}{"\u2500".repeat(separatorWidth)}</Text>
      <Text>
        {"  "}
        <Text dimColor>{"Type "}</Text>
        <Text color={colors.primary}>/help</Text>
        <Text dimColor>{" for commands \u00b7 "}</Text>
        <Text color={colors.muted}>Ctrl+C</Text>
        <Text dimColor>{" twice to exit"}</Text>
      </Text>
      <Text> </Text>
    </Box>
  );
}, (prev, next) => prev.version === next.version && prev.colors === next.colors && prev.width === next.width);

interface ConnectionInfoProps {
  connectionInfo: string[];
  colors: Theme["colors"];
}

export const ConnectionInfo = React.memo(function ConnectionInfo({ connectionInfo, colors }: ConnectionInfoProps) {
  return (
    <Box flexDirection="column" paddingX={2} marginBottom={1}>
      {connectionInfo.map((line, i) => (
        <Text key={i} color={
          line.startsWith("\u2714") || line.startsWith("✔") ? colors.success :
          line.startsWith("\u2718") || line.startsWith("✗") ? colors.error :
          colors.muted
        }>{line}</Text>
      ))}
    </Box>
  );
}, (prev, next) => prev.connectionInfo === next.connectionInfo && prev.colors === next.colors);
