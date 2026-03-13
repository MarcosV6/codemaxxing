export interface Theme {
  name: string;
  description: string;
  colors: {
    primary: string;      // Main accent (borders, highlights)
    secondary: string;    // Secondary accent (banner, headings)
    muted: string;        // Dimmed text (hints, timestamps)
    text: string;         // Normal text
    userInput: string;    // User input text
    response: string;     // AI response marker
    tool: string;         // Tool call text
    toolResult: string;   // Tool result text
    error: string;        // Error messages
    success: string;      // Success messages
    warning: string;      // Warning/approval prompts
    spinner: string;      // Spinner color
    border: string;       // Border color
    suggestion: string;   // Highlighted suggestion
  };
}

export const THEMES: Record<string, Theme> = {
  neon: {
    name: "Neon",
    description: "Cyberpunk neon (default)",
    colors: {
      primary: "#00FFFF",
      secondary: "#FF00FF",
      muted: "#008B8B",
      text: "",
      userInput: "#008B8B",
      response: "#00FFFF",
      tool: "#FF00FF",
      toolResult: "#008B8B",
      error: "red",
      success: "#00FF00",
      warning: "#FF8C00",
      spinner: "#00FFFF",
      border: "#00FFFF",
      suggestion: "#FF00FF",
    },
  },
  dracula: {
    name: "Dracula",
    description: "Dark purple tones",
    colors: {
      primary: "#BD93F9",
      secondary: "#FF79C6",
      muted: "#6272A4",
      text: "#F8F8F2",
      userInput: "#8BE9FD",
      response: "#BD93F9",
      tool: "#FF79C6",
      toolResult: "#6272A4",
      error: "#FF5555",
      success: "#50FA7B",
      warning: "#FFB86C",
      spinner: "#BD93F9",
      border: "#BD93F9",
      suggestion: "#FF79C6",
    },
  },
  gruvbox: {
    name: "Gruvbox",
    description: "Warm retro tones",
    colors: {
      primary: "#FE8019",
      secondary: "#FABD2F",
      muted: "#928374",
      text: "#EBDBB2",
      userInput: "#83A598",
      response: "#FE8019",
      tool: "#FABD2F",
      toolResult: "#928374",
      error: "#FB4934",
      success: "#B8BB26",
      warning: "#FABD2F",
      spinner: "#FE8019",
      border: "#FE8019",
      suggestion: "#FABD2F",
    },
  },
  nord: {
    name: "Nord",
    description: "Cool arctic blues",
    colors: {
      primary: "#88C0D0",
      secondary: "#81A1C1",
      muted: "#4C566A",
      text: "#ECEFF4",
      userInput: "#88C0D0",
      response: "#81A1C1",
      tool: "#5E81AC",
      toolResult: "#4C566A",
      error: "#BF616A",
      success: "#A3BE8C",
      warning: "#EBCB8B",
      spinner: "#88C0D0",
      border: "#81A1C1",
      suggestion: "#88C0D0",
    },
  },
  mono: {
    name: "Mono",
    description: "Clean monochrome — easy on the eyes",
    colors: {
      primary: "#AAAAAA",
      secondary: "#FFFFFF",
      muted: "#666666",
      text: "#CCCCCC",
      userInput: "#AAAAAA",
      response: "#FFFFFF",
      tool: "#CCCCCC",
      toolResult: "#666666",
      error: "#FF6666",
      success: "#66FF66",
      warning: "#FFAA66",
      spinner: "#AAAAAA",
      border: "#888888",
      suggestion: "#FFFFFF",
    },
  },
  solarized: {
    name: "Solarized",
    description: "Solarized dark",
    colors: {
      primary: "#268BD2",
      secondary: "#2AA198",
      muted: "#586E75",
      text: "#839496",
      userInput: "#2AA198",
      response: "#268BD2",
      tool: "#B58900",
      toolResult: "#586E75",
      error: "#DC322F",
      success: "#859900",
      warning: "#CB4B16",
      spinner: "#268BD2",
      border: "#268BD2",
      suggestion: "#2AA198",
    },
  },
  hacker: {
    name: "Hacker",
    description: "Green on black — classic terminal",
    colors: {
      primary: "#00FF00",
      secondary: "#00CC00",
      muted: "#006600",
      text: "#00DD00",
      userInput: "#00FF00",
      response: "#00FF00",
      tool: "#00CC00",
      toolResult: "#006600",
      error: "#FF0000",
      success: "#00FF00",
      warning: "#FFFF00",
      spinner: "#00FF00",
      border: "#00FF00",
      suggestion: "#00CC00",
    },
  },
};

export const DEFAULT_THEME = "neon";

export function getTheme(name: string): Theme {
  return THEMES[name] ?? THEMES[DEFAULT_THEME];
}

export function listThemes(): string[] {
  return Object.keys(THEMES);
}
