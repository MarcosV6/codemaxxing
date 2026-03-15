import type { Key } from "ink";
import type { WizardContext } from "./wizard-types.js";
import { detectHardware } from "../utils/hardware.js";
import { getRecommendationsWithLlmfit } from "../utils/models.js";
import { isOllamaInstalled, isOllamaRunning, startOllama, pullModel, getOllamaInstallCommand } from "../utils/ollama.js";
import { openRouterOAuth } from "../utils/auth.js";

export function handleWizardScreen(_inputChar: string, key: Key, ctx: WizardContext): boolean {
  if (!ctx.wizardScreen) return false;

  if (ctx.wizardScreen === "connection") {
    const items = ["local", "openrouter", "apikey", "existing"];
    if (key.upArrow) {
      ctx.setWizardIndex((prev) => (prev - 1 + items.length) % items.length);
      return true;
    }
    if (key.downArrow) {
      ctx.setWizardIndex((prev) => (prev + 1) % items.length);
      return true;
    }
    if (key.escape) {
      ctx.setWizardScreen(null);
      return true;
    }
    if (key.return) {
      const selected = items[ctx.wizardIndex];
      if (selected === "local") {
        const hw = detectHardware();
        ctx.setWizardHardware(hw);
        const { models: recs } = getRecommendationsWithLlmfit(hw);
        ctx.setWizardModels(recs.filter(m => m.fit !== "skip"));
        ctx.setWizardScreen("models");
        ctx.setWizardIndex(() => 0);
      } else if (selected === "openrouter") {
        ctx.setWizardScreen(null);
        ctx.addMsg("info", "Starting OpenRouter OAuth — opening browser...");
        ctx.setLoading(true);
        ctx.setSpinnerMsg("Waiting for authorization...");
        openRouterOAuth((msg: string) => ctx.addMsg("info", msg))
          .then(() => {
            ctx.addMsg("info", "✅ OpenRouter authenticated! Use /connect to connect.");
            ctx.setLoading(false);
          })
          .catch((err: any) => { ctx.addMsg("error", `OAuth failed: ${err.message}`); ctx.setLoading(false); });
      } else if (selected === "apikey") {
        ctx.setWizardScreen(null);
        ctx.setLoginPicker(true);
        ctx.setLoginPickerIndex(() => 0);
      } else if (selected === "existing") {
        ctx.setWizardScreen(null);
        ctx.addMsg("info", "Start your LLM server, then type /connect to retry.");
      }
      return true;
    }
    return true;
  }

  if (ctx.wizardScreen === "models") {
    const models = ctx.wizardModels;
    if (key.upArrow) {
      ctx.setWizardIndex((prev) => (prev - 1 + models.length) % models.length);
      return true;
    }
    if (key.downArrow) {
      ctx.setWizardIndex((prev) => (prev + 1) % models.length);
      return true;
    }
    if (key.escape) {
      ctx.setWizardScreen("connection");
      ctx.setWizardIndex(() => 0);
      return true;
    }
    if (key.return) {
      const selected = models[ctx.wizardIndex];
      if (selected) {
        ctx.setWizardSelectedModel(selected);
        if (!isOllamaInstalled()) {
          ctx.setWizardScreen("install-ollama");
        } else {
          startPullFlow(ctx, selected);
        }
      }
      return true;
    }
    return true;
  }

  if (ctx.wizardScreen === "install-ollama") {
    if (key.escape) {
      ctx.setWizardScreen("models");
      ctx.setWizardIndex(() => 0);
      return true;
    }
    if (key.return) {
      if (!isOllamaInstalled()) {
        ctx.setLoading(true);
        ctx.setSpinnerMsg("Installing Ollama... this may take a minute");

        const installCmd = getOllamaInstallCommand(ctx.wizardHardware?.os ?? "linux");
        (async () => {
          try {
            const { exec } = ctx._require("child_process");
            await new Promise<void>((resolve, reject) => {
              exec(installCmd, { timeout: 180000 }, (err: any, _stdout: string, stderr: string) => {
                if (err) reject(new Error(stderr || err.message));
                else resolve();
              });
            });
            ctx.addMsg("info", "✅ Ollama installed! Proceeding to model download...");
            ctx.setLoading(false);
            await new Promise(r => setTimeout(r, 2000));
            ctx.setWizardScreen("models");
          } catch (e: any) {
            ctx.addMsg("error", `Install failed: ${e.message}`);
            ctx.addMsg("info", `Try manually in a separate terminal: ${installCmd}`);
            ctx.setLoading(false);
            ctx.setWizardScreen("install-ollama");
          }
        })();
        return true;
      }
      // Ollama already installed — proceed to pull
      {
        const selected = ctx.wizardSelectedModel;
        if (selected) {
          startPullFlow(ctx, selected);
        }
      }
      return true;
    }
    return true;
  }

  if (ctx.wizardScreen === "pulling") {
    if (ctx.wizardPullError && key.return) {
      const selected = ctx.wizardSelectedModel;
      if (selected) {
        ctx.setWizardPullError(null);
        ctx.setWizardPullProgress({ status: "retrying", percent: 0 });
        (async () => {
          try {
            const running = await isOllamaRunning();
            if (!running) {
              startOllama();
              for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 1000));
                if (await isOllamaRunning()) break;
              }
            }
            await pullModel(selected.ollamaId, (p) => ctx.setWizardPullProgress(p));
            ctx.setWizardPullProgress({ status: "success", percent: 100 });
            await new Promise(r => setTimeout(r, 500));
            ctx.setWizardScreen(null);
            ctx.setWizardPullProgress(null);
            ctx.setWizardSelectedModel(null);
            ctx.addMsg("info", `✅ ${selected.name} installed! Connecting...`);
            await ctx.connectToProvider(true);
          } catch (err: any) {
            ctx.setWizardPullError(err.message);
          }
        })();
      }
      return true;
    }
    if (ctx.wizardPullError && key.escape) {
      ctx.setWizardScreen("models");
      ctx.setWizardIndex(() => 0);
      ctx.setWizardPullError(null);
      ctx.setWizardPullProgress(null);
      return true;
    }
    return true; // Ignore keys while pulling
  }

  return true;
}

// ── Shared pull-model flow ──

function startPullFlow(ctx: WizardContext, selected: { ollamaId: string; name: string }): void {
  ctx.setWizardScreen("pulling");
  ctx.setWizardPullProgress({ status: "starting", percent: 0 });
  ctx.setWizardPullError(null);

  (async () => {
    try {
      const running = await isOllamaRunning();
      if (!running) {
        ctx.setWizardPullProgress({ status: "Starting Ollama server...", percent: 0 });
        startOllama();
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 1000));
          if (await isOllamaRunning()) break;
        }
        if (!(await isOllamaRunning())) {
          ctx.setWizardPullError("Could not start Ollama server. Run 'ollama serve' manually, then press Enter.");
          return;
        }
      }

      await pullModel(selected.ollamaId, (p) => {
        ctx.setWizardPullProgress(p);
      });

      ctx.setWizardPullProgress({ status: "success", percent: 100 });

      await new Promise(r => setTimeout(r, 500));
      ctx.setWizardScreen(null);
      ctx.setWizardPullProgress(null);
      ctx.setWizardSelectedModel(null);
      ctx.addMsg("info", `✅ ${selected.name} installed! Connecting...`);
      await ctx.connectToProvider(true);
    } catch (err: any) {
      ctx.setWizardPullError(err.message);
    }
  })();
}
