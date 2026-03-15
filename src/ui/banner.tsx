import React from "react";
import { Box, Text } from "ink";
import type { Theme } from "../themes.js";

const CODE_LINES = [
  "                     _(`-')    (`-')  _ ",
  " _             .->  ( (OO ).-> ( OO).-/ ",
  " \\-,-----.(`-')----. \\    .'_ (,------. ",
  "  |  .--./( OO).-.  ''`'-..__) |  .---' ",
  " /_) (`-')( _) | |  ||  |  ' |(|  '--.  ",
  " ||  |OO ) \\|  |)|  ||  |  / : |  .--'  ",
  "(_'  '--'\\  '  '-'  '|  '-'  / |  `---. ",
  "   `-----'   `-----' `------'  `------' ",
];

const MAXXING_LINES = [
  "<-. (`-')   (`-')  _  (`-')      (`-')      _     <-. (`-')_            ",
  "   \\(OO )_  (OO ).-/  (OO )_.->  (OO )_.-> (_)       \\( OO) )    .->    ",
  ",--./  ,-.) / ,---.   (_| \\_)--. (_| \\_)--.,-(`-'),--./ ,--/  ,---(`-') ",
  "|   `.'   | | \\ /`.\\  \\  `.'  /  \\  `.'  / | ( OO)|   \\ |  | '  .-(OO ) ",
  "|  |'.'|  | '-'|_.' |  \\    .')   \\    .') |  |  )|  . '|  |)|  | .-, \\ ",
  "|  |   |  |(|  .-.  |  .'    \\    .'    \\ (|  |_/ |  |\\    | |  | '.(_/ ",
  "|  |   |  | |  | |  | /  .'.  \\  /  .'.  \\ |  |'->|  | \\   | |  '-'  |  ",
  "`--'   `--' `--' `--'`--'   '--'`--'   '--'`--'   `--'  `--'  `-----'   ",
];

interface BannerProps {
  version: string;
  colors: Theme["colors"];
}

export function Banner({ version, colors }: BannerProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.border} paddingX={1}>
      {CODE_LINES.map((line, i) => (
        <Text key={`c${i}`} color={colors.primary}>{line}</Text>
      ))}
      {MAXXING_LINES.map((line, i) => (
        <Text key={`m${i}`} color={colors.secondary}>{line}</Text>
      ))}
      <Text>
        <Text color={colors.muted}>{"                            v" + version}</Text>
        {"  "}<Text color={colors.primary}>💪</Text>
        {"  "}<Text dimColor>your code. your model. no excuses.</Text>
      </Text>
      <Text dimColor>{"  Type "}<Text color={colors.muted}>/help</Text>{" for commands · "}<Text color={colors.muted}>Ctrl+C</Text>{" twice to exit"}</Text>
    </Box>
  );
}

interface ConnectionInfoProps {
  connectionInfo: string[];
  colors: Theme["colors"];
}

export function ConnectionInfo({ connectionInfo, colors }: ConnectionInfoProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.muted} paddingX={1} marginBottom={1}>
      {connectionInfo.map((line, i) => (
        <Text key={i} color={line.startsWith("✔") ? colors.primary : line.startsWith("✗") ? colors.error : colors.muted}>{line}</Text>
      ))}
    </Box>
  );
}
