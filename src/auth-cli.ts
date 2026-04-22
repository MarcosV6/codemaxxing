#!/usr/bin/env node

/**
 * codemaxxing auth CLI
 *
 * Commands:
 *   codemaxxing login              — Interactive auth setup
 *   codemaxxing auth list          — List saved credentials
 *   codemaxxing auth remove <name> — Remove a credential
 *   codemaxxing auth openrouter    — Start OpenRouter OAuth
 *   codemaxxing auth anthropic     — Get Anthropic via Claude Code
 *   codemaxxing auth openai        — Import Codex CLI credentials
 *   codemaxxing auth qwen          — Save Qwen API key
 *   codemaxxing auth api-key <name> — Save API key interactively
 */

import {
  PROVIDERS,
  getCredentials,
  removeCredential,
  openRouterOAuth,
  anthropicSetupToken,
  importCodexToken,
  saveApiKey,
  detectAvailableAuth,
} from "./utils/auth.js";

export async function main() {
  const command = process.argv[2] ?? "login";

  switch (command) {
    case "login": {
      console.log("\n💪 Codemaxxing Authentication\n");
      console.log("Available providers:\n");

      PROVIDERS.forEach((p, i) => {
        const methods = p.methods.filter((m) => m !== "none").join(", ");
        console.log(`  ${i + 1}. ${p.name}`);
        console.log(`     ${p.description}`);
        console.log(`     Methods: ${methods}\n`);
      });

      console.log("Detected on this machine:");
      const detected = detectAvailableAuth();
      if (detected.length === 0) {
        console.log("  — No existing CLI credentials found\n");
      } else {
        detected.forEach((d) => {
          console.log(`  ⚡ ${d.provider} — ${d.description}`);
        });
        console.log("");
      }

      const readline = await import("readline");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

      const choice = await ask("Select a provider (1-" + PROVIDERS.length + ") or name: ");
      const providerId = PROVIDERS[parseInt(choice) - 1]?.id ?? choice.toLowerCase();
      const provider = PROVIDERS.find((p) => p.id === providerId);

      if (!provider) {
        console.log(`Unknown provider: ${providerId}`);
        process.exit(1);
      }

      console.log(`\nSetting up ${provider.name}...\n`);

      try {
        if (providerId === "openrouter") {
          const cred = await openRouterOAuth((msg) => console.log(`  ${msg}`));
          console.log(`\n✅ OpenRouter authenticated! (${cred.label})`);
        } else if (providerId === "anthropic") {
          if (provider.methods.includes("setup-token")) {
            const cred = await anthropicSetupToken((msg) => console.log(`  ${msg}`));
            console.log(`\n✅ Anthropic authenticated! (${cred.label})`);
          } else {
            const apiKey = await ask("Enter your Anthropic API key: ");
            const cred = saveApiKey(providerId, apiKey);
            console.log(`\n✅ Saved API key for ${provider.name}`);
          }
        } else if (providerId === "openai") {
          const imported = importCodexToken((msg) => console.log(`  ${msg}`));
          if (imported) {
            console.log(`\n✅ Imported Codex credentials! (${imported.label})`);
          } else {
            const apiKey = await ask("Enter your OpenAI API key: ");
            const cred = saveApiKey(providerId, apiKey);
            console.log(`\n✅ Saved API key for ${provider.name}`);
          }
        } else if (providerId === "qwen") {
          const apiKey = await ask("Enter your Qwen/DashScope API key: ");
          const cred = saveApiKey(providerId, apiKey);
          console.log(`\n✅ Saved API key for ${provider.name}`);
        } else if (providerId === "custom") {
          const baseUrl = await ask("Enter the base URL: ");
          const apiKey = await ask("Enter your API key: ");
          const cred = saveApiKey(providerId, apiKey, baseUrl, "Custom provider");
          console.log(`\n✅ Saved custom provider`);
        } else {
          const apiKey = await ask(`Enter your ${provider.name} API key (${provider.consoleUrl}): `);
          const cred = saveApiKey(providerId, apiKey);
          console.log(`\n✅ Saved API key for ${provider.name}`);
        }

        console.log("\nRun 'codemaxxing' to start coding!");
      } catch (err: any) {
        console.error(`\n❌ Error: ${err.message}`);
        process.exit(1);
      } finally {
        rl.close();
      }
      break;
    }

    case "list":
    case "ls": {
      const creds = getCredentials();
      console.log("\n💪 Saved Credentials\n");

      if (creds.length === 0) {
        console.log("  No credentials saved.\n");
        console.log("  Run 'codemaxxing login' to set up authentication.\n");
        break;
      }

      creds.forEach((c) => {
        console.log(`  ${c.provider}`);
        console.log(`    Method: ${c.method}`);
        console.log(`    Label: ${c.label ?? "—"}`);
        const maskedKey = c.apiKey.length > 12
          ? c.apiKey.slice(0, 4) + "•".repeat(8) + c.apiKey.slice(-4)
          : "••••••••";
        console.log(`    Key: ${maskedKey}`);
        console.log(`    Base: ${c.baseUrl}`);
        console.log("");
      });
      break;
    }

    case "remove":
    case "rm":
    case "delete": {
      const target = process.argv[3];
      if (!target) {
        console.log("Usage: codemaxxing auth remove <provider-name>");
        console.log("\nSaved providers:");
        getCredentials().forEach((c) => console.log(`  ${c.provider}`));
        process.exit(1);
      }

      const removed = removeCredential(target);
      if (removed) {
        console.log(`✅ Removed ${target}`);
      } else {
        console.log(`❌ No credential found for: ${target}`);
        console.log("\nSaved providers:");
        getCredentials().forEach((c) => console.log(`  ${c.provider}`));
        process.exit(1);
      }
      break;
    }

    case "openrouter": {
      console.log("Starting OpenRouter OAuth flow...\n");
      try {
        const cred = await openRouterOAuth((msg) => console.log(`  ${msg}`));
        console.log(`\n✅ OpenRouter authenticated!`);
      } catch (err: any) {
        console.error(`\n❌ ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case "anthropic": {
      console.log("Starting Anthropic setup-token flow...\n");
      try {
        const cred = await anthropicSetupToken((msg) => console.log(`  ${msg}`));
        console.log(`\n✅ Anthropic authenticated!`);
      } catch (err: any) {
        console.error(`\n❌ ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case "openai": {
      console.log("Checking for Codex CLI credentials...\n");
      const imported = importCodexToken((msg) => console.log(`  ${msg}`));
      if (imported) {
        console.log(`\n✅ Imported Codex credentials!`);
      } else {
        console.log("\n❌ No Codex CLI credentials found.");
        console.log("Make sure Codex CLI is installed and you've logged in.");
      }
      break;
    }

    case "qwen": {
      const readline = await import("readline");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));
      try {
        const apiKey = await ask("Enter your Qwen/DashScope API key: ");
        const cred = saveApiKey("qwen", apiKey);
        console.log(`\n✅ Saved API key for ${cred.provider}`);
      } finally {
        rl.close();
      }
      break;
    }

    case "api-key": {
      const providerId = process.argv[3];
      const apiKeyArg = process.argv[4];
      if (!providerId) {
        console.log("Usage: codemaxxing auth api-key <provider-id>");
        process.exit(1);
      }

      if (apiKeyArg) {
        console.log("⚠️  Passing API keys directly on the command line is discouraged.");
        console.log("   Prefer: codemaxxing auth api-key <provider-id>\n");
      }

      const readline = await import("readline");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

      try {
        const apiKey = apiKeyArg ?? await ask(`Enter your ${providerId} API key: `);
        if (!apiKey.trim()) {
          console.log("❌ API key cannot be empty.");
          process.exit(1);
        }
        const cred = saveApiKey(providerId, apiKey.trim());
        console.log(`\n✅ Saved API key for ${cred.provider}`);
      } finally {
        rl.close();
      }
      break;
    }

    case "help":
    case "--help":
    case "-h": {
      console.log(`
💪 Codemaxxing Auth

Commands:
  codemaxxing login              Interactive authentication setup
  codemaxxing auth list          List saved credentials
  codemaxxing auth remove <name> Remove a credential
  codemaxxing auth openrouter    Start OpenRouter OAuth flow
  codemaxxing auth anthropic     Get Anthropic via Claude Code CLI
  codemaxxing auth openai        Import Codex CLI credentials
  codemaxxing auth qwen          Save Qwen API key
  codemaxxing auth api-key <id>  Save API key interactively
  codemaxxing auth help          Show this help

Examples:
  codemaxxing login              # Interactive provider picker
  codemaxxing auth openrouter    # One browser login, access to 200+ models
  codemaxxing auth anthropic     # Use your Claude subscription via Claude Code
  codemaxxing auth list          # See what's saved
`);
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log("Run 'codemaxxing auth help' for available commands.");
      process.exit(1);
  }
}

// Always run main — this module is either imported and main() called, or run directly
main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});