import { execSync, spawn, type ChildProcess } from "child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";

const VOICE_TMP_DIR = join(tmpdir(), "codemaxxing-voice");
const CONFIG_DIR = join(homedir(), ".codemaxxing");

// ── Types ──

export interface VoiceConfig {
  /** Which STT backend to use: 'whisper-api' | 'local-whisper' | 'auto' */
  backend: "whisper-api" | "local-whisper" | "auto";
  /** Whisper API key (uses OpenAI key by default) */
  apiKey?: string;
  /** Language hint for transcription */
  language?: string;
}

export interface RecordingState {
  process: ChildProcess | null;
  filePath: string;
  startTime: number;
  isRecording: boolean;
}

let currentRecording: RecordingState | null = null;

// ── Detection ──

/**
 * Check what recording tools are available on the system.
 */
export function detectVoiceCapabilities(): {
  canRecord: boolean;
  recorder: string | null;
  canTranscribe: boolean;
  transcriber: string | null;
  missing: string[];
} {
  const missing: string[] = [];
  let recorder: string | null = null;
  let transcriber: string | null = null;

  // Check for recording capability
  if (process.platform === "darwin") {
    // macOS: try sox (rec), ffmpeg, or the built-in afrecord (macOS 14+)
    try {
      execSync("which rec", { stdio: "pipe" });
      recorder = "sox";
    } catch {
      try {
        execSync("which ffmpeg", { stdio: "pipe" });
        recorder = "ffmpeg";
      } catch {
        missing.push("sox or ffmpeg (install: brew install sox)");
      }
    }
  } else if (process.platform === "linux") {
    try {
      execSync("which arecord", { stdio: "pipe" });
      recorder = "arecord";
    } catch {
      try {
        execSync("which ffmpeg", { stdio: "pipe" });
        recorder = "ffmpeg";
      } catch {
        missing.push("arecord or ffmpeg (install: sudo apt install alsa-utils or ffmpeg)");
      }
    }
  } else {
    missing.push("Voice recording not supported on this platform");
  }

  // Check for transcription capability
  try {
    execSync("which whisper", { stdio: "pipe" });
    transcriber = "local-whisper";
  } catch {
    // Fall back to API-based transcription
    try {
      const { getCredential } = require("../utils/auth.js");
      const cred = getCredential("openai");
      if (cred?.apiKey) {
        transcriber = "whisper-api";
      }
    } catch {
      // Try loading config for API key
    }

    if (!transcriber) {
      missing.push("whisper CLI (pip install openai-whisper) or OpenAI API key for Whisper API");
    }
  }

  return {
    canRecord: recorder !== null,
    recorder,
    canTranscribe: transcriber !== null,
    transcriber,
    missing,
  };
}

// ── Recording ──

/**
 * Start recording audio from the microphone.
 */
export function startRecording(): { success: boolean; error?: string } {
  if (currentRecording?.isRecording) {
    return { success: false, error: "Already recording" };
  }

  if (!existsSync(VOICE_TMP_DIR)) {
    mkdirSync(VOICE_TMP_DIR, { recursive: true });
  }

  const caps = detectVoiceCapabilities();
  if (!caps.canRecord) {
    return { success: false, error: `Cannot record: ${caps.missing.join(", ")}` };
  }

  const filePath = join(VOICE_TMP_DIR, `recording-${Date.now()}.wav`);
  let proc: ChildProcess;

  if (caps.recorder === "sox") {
    // sox/rec: record to WAV
    proc = spawn("rec", ["-q", filePath, "rate", "16k", "channels", "1"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } else if (caps.recorder === "ffmpeg") {
    // ffmpeg: record from default audio device
    const inputDevice = process.platform === "darwin" ? "avfoundation" : "pulse";
    const inputSource = process.platform === "darwin" ? ":0" : "default";
    proc = spawn("ffmpeg", [
      "-y", "-f", inputDevice, "-i", inputSource,
      "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
      filePath,
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } else if (caps.recorder === "arecord") {
    proc = spawn("arecord", ["-f", "cd", "-t", "wav", "-r", "16000", "-c", "1", filePath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } else {
    return { success: false, error: "No recording tool available" };
  }

  currentRecording = {
    process: proc,
    filePath,
    startTime: Date.now(),
    isRecording: true,
  };

  proc.on("exit", () => {
    if (currentRecording) {
      currentRecording.isRecording = false;
    }
  });

  return { success: true };
}

/**
 * Stop recording and return the audio file path.
 */
export function stopRecording(): { filePath: string; duration: number } | null {
  if (!currentRecording?.isRecording) return null;

  const recording = currentRecording;
  currentRecording = null;

  // Send SIGINT to gracefully stop the recorder
  if (recording.process) {
    recording.process.kill("SIGINT");
  }
  recording.isRecording = false;

  const duration = Math.floor((Date.now() - recording.startTime) / 1000);
  return { filePath: recording.filePath, duration };
}

/**
 * Check if currently recording.
 */
export function isRecording(): boolean {
  return currentRecording?.isRecording ?? false;
}

// ── Transcription ──

/**
 * Transcribe an audio file to text.
 */
export async function transcribeAudio(
  filePath: string,
  config?: Partial<VoiceConfig>
): Promise<{ text: string; error?: string }> {
  if (!existsSync(filePath)) {
    return { text: "", error: "Audio file not found" };
  }

  const caps = detectVoiceCapabilities();
  const backend = config?.backend || "auto";

  // Try local whisper first if available
  if ((backend === "auto" || backend === "local-whisper") && caps.transcriber === "local-whisper") {
    try {
      const langFlag = config?.language ? `--language ${config.language}` : "";
      const output = execSync(
        `whisper "${filePath}" --model base --output_format txt ${langFlag}`,
        { encoding: "utf-8", timeout: 60000, stdio: ["pipe", "pipe", "pipe"] }
      ).trim();

      // Whisper outputs to a .txt file next to the input
      const txtPath = filePath.replace(/\.\w+$/, ".txt");
      if (existsSync(txtPath)) {
        const text = readFileSync(txtPath, "utf-8").trim();
        try { unlinkSync(txtPath); } catch {}
        return { text };
      }
      return { text: output };
    } catch (err: any) {
      if (backend === "local-whisper") {
        return { text: "", error: `Local whisper failed: ${err.message}` };
      }
      // Fall through to API
    }
  }

  // OpenAI Whisper API
  if (backend === "auto" || backend === "whisper-api") {
    try {
      const apiKey = config?.apiKey || await getOpenAIKeyForWhisper();
      if (!apiKey) {
        return { text: "", error: "No OpenAI API key available for Whisper transcription" };
      }

      const audioData = readFileSync(filePath);
      const formData = new FormData();
      formData.append("file", new Blob([audioData], { type: "audio/wav" }), "recording.wav");
      formData.append("model", "whisper-1");
      if (config?.language) formData.append("language", config.language);

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        return { text: "", error: `Whisper API error: ${res.status} ${errText}` };
      }

      const data = await res.json() as { text?: string };
      return { text: data.text ?? "" };
    } catch (err: any) {
      return { text: "", error: `Whisper API failed: ${err.message}` };
    }
  }

  return { text: "", error: "No transcription backend available" };
}

async function getOpenAIKeyForWhisper(): Promise<string | null> {
  try {
    const { getCredential } = await import("./auth.js");
    const cred = getCredential("openai");
    return cred?.apiKey ?? null;
  } catch {
    return null;
  }
}

/**
 * Clean up temp audio files.
 */
export function cleanupVoiceFiles(): void {
  try {
    if (existsSync(VOICE_TMP_DIR)) {
      const { readdirSync, unlinkSync } = require("fs");
      for (const f of readdirSync(VOICE_TMP_DIR)) {
        try { unlinkSync(join(VOICE_TMP_DIR, f)); } catch {}
      }
    }
  } catch {}
}
