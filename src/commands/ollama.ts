import {
  isOllamaInstalled,
  isOllamaRunning,
  getOllamaInstallCommand,
  startOllama,
  stopOllama,
  pullModel,
  listInstalledModelsDetailed,
  getGPUMemoryUsage,
  type PullProgress,
} from "../utils/ollama.js";

type AddMsg = (type: "user" | "response" | "tool" | "tool-result" | "error" | "info", text: string) => void;

type SetState<T> = (value: T) => void;

interface HandleOllamaCommandOptions {
  trimmed: string;
  addMsg: AddMsg;
  refreshConnectionBanner: () => Promise<void>;
  setOllamaPullPicker: SetState<boolean>;
  setOllamaPullPickerIndex: SetState<number>;
  setOllamaPulling: SetState<{ model: string; progress: PullProgress } | null>;
  setOllamaDeletePicker: SetState<{ models: { name: string; size: number }[] } | null>;
  setOllamaDeletePickerIndex: SetState<number>;
  setOllamaDeleteConfirm: SetState<{ model: string; size: number } | null>;
}

async function ensureOllamaRunning(
  addMsg: AddMsg,
  startMessage: string,
  failMessage: string,
): Promise<boolean> {
  let running = await isOllamaRunning();
  if (running) return true;

  addMsg("info", startMessage);
  startOllama();

  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await isOllamaRunning()) {
      running = true;
      break;
    }
  }

  if (!running) {
    addMsg("error", failMessage);
    return false;
  }

  return true;
}

export async function tryHandleOllamaCommand(options: HandleOllamaCommandOptions): Promise<boolean> {
  const {
    trimmed,
    addMsg,
    refreshConnectionBanner,
    setOllamaPullPicker,
    setOllamaPullPickerIndex,
    setOllamaPulling,
    setOllamaDeletePicker,
    setOllamaDeletePickerIndex,
    setOllamaDeleteConfirm,
  } = options;

  if (trimmed === "/ollama" || trimmed === "/ollama status") {
    const running = await isOllamaRunning();
    const lines: string[] = [`Ollama: ${running ? "running" : "stopped"}`];
    if (running) {
      const models = await listInstalledModelsDetailed();
      if (models.length > 0) {
        lines.push(`Installed models (${models.length}):`);
        for (const model of models) {
          const sizeGB = (model.size / (1024 * 1024 * 1024)).toFixed(1);
          lines.push(`  ${model.name}  (${sizeGB} GB)`);
        }
      } else {
        lines.push("No models installed.");
      }
      const gpuMem = getGPUMemoryUsage();
      if (gpuMem) lines.push(`GPU: ${gpuMem}`);
    } else {
      lines.push("Start with: /ollama start");
    }
    addMsg("info", lines.join("\n"));
    return true;
  }

  if (trimmed === "/ollama list") {
    const running = await isOllamaRunning();
    if (!running) {
      addMsg("info", "Ollama is not running. Start with /ollama start");
      return true;
    }
    const models = await listInstalledModelsDetailed();
    if (models.length === 0) {
      addMsg("info", "No models installed. Pull one with /ollama pull <model>");
    } else {
      const lines = models.map((model) => {
        const sizeGB = (model.size / (1024 * 1024 * 1024)).toFixed(1);
        return `  ${model.name}  (${sizeGB} GB)`;
      });
      addMsg("info", `Installed models:\n${lines.join("\n")}`);
    }
    return true;
  }

  if (trimmed === "/ollama start") {
    const running = await isOllamaRunning();
    if (running) {
      addMsg("info", "Ollama is already running.");
      return true;
    }
    if (!isOllamaInstalled()) {
      addMsg(
        "error",
        `Ollama is not installed. Install with: ${getOllamaInstallCommand(
          process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux",
        )}`,
      );
      return true;
    }
    startOllama();
    addMsg("info", "Starting Ollama server...");
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (await isOllamaRunning()) {
        addMsg("info", "Ollama is running.");
        await refreshConnectionBanner();
        return true;
      }
    }
    addMsg("error", "Ollama did not start in time. Try running 'ollama serve' manually.");
    return true;
  }

  if (trimmed === "/ollama stop") {
    const running = await isOllamaRunning();
    if (!running) {
      addMsg("info", "Ollama is not running.");
      return true;
    }
    addMsg("info", "Stopping Ollama...");
    const result = await stopOllama();
    addMsg(result.ok ? "info" : "error", result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
    if (result.ok) await refreshConnectionBanner();
    return true;
  }

  if (trimmed === "/ollama pull") {
    setOllamaPullPicker(true);
    setOllamaPullPickerIndex(0);
    return true;
  }

  if (trimmed.startsWith("/ollama pull ")) {
    const modelId = trimmed.replace("/ollama pull ", "").trim();
    if (!modelId) {
      setOllamaPullPicker(true);
      setOllamaPullPickerIndex(0);
      return true;
    }
    if (!isOllamaInstalled()) {
      addMsg("error", "Ollama is not installed.");
      return true;
    }

    const running = await ensureOllamaRunning(
      addMsg,
      "Starting Ollama server...",
      "Could not start Ollama. Run 'ollama serve' manually.",
    );
    if (!running) return true;

    setOllamaPulling({ model: modelId, progress: { status: "starting", percent: 0 } });
    try {
      await pullModel(modelId, (progress) => {
        setOllamaPulling({ model: modelId, progress });
      });
      setOllamaPulling(null);
      addMsg("info", `✅ Downloaded ${modelId}`);
    } catch (err: any) {
      setOllamaPulling(null);
      addMsg("error", `Failed to pull ${modelId}: ${err.message}`);
    }
    return true;
  }

  if (trimmed === "/ollama delete") {
    const running = await ensureOllamaRunning(
      addMsg,
      "Starting Ollama to list models...",
      "Could not start Ollama. Start it manually first.",
    );
    if (!running) return true;

    const models = await listInstalledModelsDetailed();
    if (models.length === 0) {
      addMsg("info", "No models installed.");
      return true;
    }
    setOllamaDeletePicker({ models: models.map((model) => ({ name: model.name, size: model.size })) });
    setOllamaDeletePickerIndex(0);
    return true;
  }

  if (trimmed.startsWith("/ollama delete ")) {
    const modelId = trimmed.replace("/ollama delete ", "").trim();
    if (!modelId) {
      const models = await listInstalledModelsDetailed();
      if (models.length === 0) {
        addMsg("info", "No models installed.");
        return true;
      }
      setOllamaDeletePicker({ models: models.map((model) => ({ name: model.name, size: model.size })) });
      setOllamaDeletePickerIndex(0);
      return true;
    }

    const models = await listInstalledModelsDetailed();
    const found = models.find((model) => model.name === modelId || model.name.startsWith(modelId));
    if (!found) {
      addMsg("error", `Model "${modelId}" not found. Use /ollama list to see installed models.`);
      return true;
    }
    setOllamaDeleteConfirm({ model: found.name, size: found.size });
    return true;
  }

  return false;
}
