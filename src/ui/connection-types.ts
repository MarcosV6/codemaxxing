import type { CodingAgent } from "../agent.js";
import type { WizardScreen } from "./wizard-types.js";

// ── Chat message type (shared across modules) ──

export interface ChatMessage {
  id: number;
  type: "user" | "response" | "tool" | "tool-result" | "error" | "info";
  text: string;
}

// ── Connection context ──

export interface ConnectionContext {
  // Connection info display
  setConnectionInfo: (val: string[]) => void;
  setReady: (val: boolean) => void;

  // Agent management
  setAgent: (val: CodingAgent | null) => void;
  setModelName: (val: string) => void;
  providerRef: { current: { baseUrl: string; apiKey: string } };

  // Loading/streaming state
  setLoading: (val: boolean) => void;
  setStreaming: (val: boolean) => void;
  setSpinnerMsg: (val: string) => void;

  // Messages
  setMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void;
  addMsg: (type: ChatMessage["type"], text: string) => void;
  nextMsgId: () => number;

  // Approval
  setApproval: (val: {
    tool: string;
    args: Record<string, unknown>;
    diff?: string;
    resolve: (decision: "yes" | "no" | "always") => void;
  } | null) => void;

  // Wizard triggers
  setWizardScreen: (val: WizardScreen) => void;
  setWizardIndex: (val: number) => void;

  // First-run model picker flow
  openModelPicker: () => Promise<void>;
}
