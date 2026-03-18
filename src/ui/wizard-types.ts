import type { HardwareInfo } from "../utils/hardware.js";
import type { ScoredModel } from "../utils/models.js";
import type { PullProgress } from "../utils/ollama.js";

export type WizardScreen = "connection" | "models" | "install-ollama" | "pulling" | null;

export interface WizardContext {
  // Wizard state
  wizardScreen: WizardScreen;
  wizardIndex: number;
  wizardModels: ScoredModel[];
  wizardHardware: HardwareInfo | null;
  wizardPullProgress: PullProgress | null;
  wizardPullError: string | null;
  wizardSelectedModel: ScoredModel | null;
  setWizardScreen: (val: WizardScreen) => void;
  setWizardIndex: (fn: (prev: number) => number) => void;
  setWizardHardware: (val: HardwareInfo | null) => void;
  setWizardModels: (val: ScoredModel[]) => void;
  setWizardPullProgress: (val: PullProgress | null) => void;
  setWizardPullError: (val: string | null) => void;
  setWizardSelectedModel: (val: ScoredModel | null) => void;

  // Transitions to other screens
  setLoginPicker: (val: boolean) => void;
  setLoginPickerIndex: (fn: (prev: number) => number) => void;

  // Loading/spinner
  setLoading: (val: boolean) => void;
  setSpinnerMsg: (val: string) => void;

  // Messaging
  addMsg: (type: "user" | "response" | "tool" | "tool-result" | "error" | "info", text: string) => void;

  // Provider connection
  connectToProvider: (isRetry: boolean) => Promise<void>;
  openModelPicker: () => Promise<void>;

  // Node require (for child_process in install-ollama)
  _require: NodeRequire;
}
