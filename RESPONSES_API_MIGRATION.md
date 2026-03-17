# Responses API Migration for GPT-5.4 Support

## Problem
ChatGPT Plus OAuth tokens can only use the **Responses API** endpoint (`/v1/responses`), not Chat Completions (`/v1/chat/completions`). Currently, we're using Chat Completions which gives the "Missing scopes" error when trying GPT-5.4.

## Solution
Implement dual-API support in codemaxxing:
- **Chat Completions** (existing): For standard OpenAI API keys and backwards compat
- **Responses API** (new): For Codex OAuth tokens → unlocks GPT-5.4, GPT-5, gpt-5.3-codex

## Architecture

### Responses API Differences vs Chat Completions

| Aspect | Chat Completions | Responses API |
|--------|------------------|---------------|
| Endpoint | `/v1/chat/completions` | `/v1/responses` |
| Input | `messages` array | `input` (string or ResponseInput) |
| State | Manual message history | `previous_response_id` or `store: true` |
| Tools | Custom functions | Built-in + Functions + MCP |
| Output | `ChatCompletionChunk` | `ResponseStreamEvent` |
| Tool Calls | `tool_calls` in message | `ResponseFunctionToolCall` items |

### Key Implementation Details

**For chat history:**
- Responses API can accept `previous_response_id` to chain conversations (stateful)
- OR we can manually rebuild ResponseInput from message history (stateless)
- We'll use **stateless** approach (rebuild from history) for compatibility with existing session storage

**For streaming:**
- Chat Completions: Listen for `choice.delta.content` and `choice.delta.tool_calls`
- Responses API: Listen for `response.text_delta` and function call events

**For tool execution:**
- Same tool calling loop (read_file, write_file, etc)
- Same approval flow
- Output items just have different shape

## Implementation Steps

1. **Create `src/utils/responses-api.ts`**
   - Mirror the streaming logic from agent.ts but use `client.responses.create()`
   - Handle ResponseStreamEvent parsing
   - Implement tool call extraction and execution
   - Return same format as Chat Completions (for compatibility)

2. **Update `src/agent.ts`**
   - Add `shouldUseResponsesAPI()` method
   - Route to Responses API for Codex OAuth + GPT-5.x models
   - Keep Chat Completions as default fallback

3. **Update `src/index.tsx`**
   - Show all OpenAI models in picker (no filtering)
   - Remove scope restriction notes

4. **Testing**
   - Switch to Claude Sonnet (working)
   - Switch to GPT-5.4 via ChatGPT OAuth → should now work
   - Verify token costs are tracked
   - Verify tool calling works

## No Breaking Changes
- Existing Chat Completions flow untouched
- Session history format stays the same
- Model switching still works
- Cost tracking unaffected
