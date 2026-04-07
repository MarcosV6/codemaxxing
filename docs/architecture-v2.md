# Codemaxxing v2.0 Architecture Specification (The "Claw-Inspired" Evolution)

**Status:** Draft / Implementation Blueprint
**Target Release:** 2026 Q2
**Core Philosophy:** High-performance, multi-agent orchestration with a "Vibe-First" developer experience.

---

## 🏗️ The Core Architecture: Modular Subsystems

Moving away from the current flat `src/` structure to a decoupled, subsystem-oriented model inspired by the `claw-code` Rust implementation.

### 1. `src/core`: The Runtime Engine
The heartbeat of Codemax_ing. This layer is responsible for the "bor_ing" but critical parts:
*   **Session Manager:** Handles session persistence (SQLite), history, and context loading/unloading.
*   **State Machine:** Mans the transition between `Idle` $\to$ `Planning` $\to$ `Executing` $\to$ `Verifying`.
*   **Context Engine:** The logic for **Context Compression** (the 80k token summarizer) and window management.

### 2. `src/orchestrator`: The Brain (Architect & Executor)
This is the intelligence layer that implements the "Agentic" workflow:
*   **The Architect Mode:** A high-reasoning agent (e.g., Claude 3.5 Sonnet or GPT-4o) that breaks a user prompt into a structured `TaskTree`.
*   **The Executor:** A faster, cheaper model (Gemma 4 or Qwen) that iterates through the `TaskTree`, performing file reads, writes, and shell commands.
*   **Multi-Agent Coordination:** The logic for spawning parallel sub-agents for concurrent tasks (e.s., Frontend vs Backend).

### 3. `src/bridge`: The MCP & Tooling Layer
The integration point for all external world interactions:
*   **MCP Client:** A standardized implementation of the **Model Context Protocol**. This allows Codemaxxing to use any tool defined in an MCP server (Google Search, Database access, Slack, etc.).
*   **Native Tools Registry:** The existing skill-based system, refactored into a unified registry that matches the MCP interface.

### 4. `src/ui`: The "Vibe" Interface
The user-facing TUI built with `Ink` and `Node.js`, focused on high-personality feedback:
*   **Terminal Engine:** Handles the complex terminal resizing, scrolling, and ANSI escape sequences.
*   **The Pulse (Status Indicators):** The rotating "chaotic" status messages (`Yapping live...`, `Spitting tokens...`) and the subtle animated streaming dots.
*   **Input Router:** Advanced command parsing, including the slash-command picker and the bracketed-paste interceptor.

---

## 🚀 Key Feature Roadmap

### Phase 1: The Foundation (Current)
- [ ] Implement the `src/core` directory structure.
- [ ] Refactor session management into a dedicated module.
- [ ] Move all "Skill" logic into the new `bridge` pattern.

### Phase 2: Orchestration & MCP
- [ ] **MCP Client Implementation:** Allow Codemaxxing to connect to any `.json` MCP server definition.
- [ $\text{Architect Mode}$: Implement the "Plan first, Execute second" workflow.
- [ $\text{Auto-Linter}$: Integrate a post-execution step that runs `eslint` or `prettier` and feeds errors back to the agent.

### Phase_3: The Polish (The "Vibe")
- [ ] Enhance the "Context Compression" UI with real-time token count visualizations.
- [ ] Expand the "Chaotic Status" library with even more unhinged strings.
- [ ] Implement a "Multi-Terminal" view for monitoring parallel sub-agents.

---

**Target Goal:** To build a tool that is as powerful as `Claude Code` but as fun and customizable as a terminal-based game. 🚀🔥