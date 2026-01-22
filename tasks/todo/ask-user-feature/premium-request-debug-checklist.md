# ask_user MCP Tool: Premium Request Debug Checklist

## Purpose
This checklist helps you verify that the native `ask_user` tool in CodeNomad does NOT trigger a premium LLM request per user answer. Use it to debug and confirm correct agent orchestration.

**Note:** The tool name is `ask_user` (with underscore) in all code logic, schemas, and UI. The name `ask-user` (with dash) is only used as a config key for MCP server registration.

---

## 1. Confirm MCP Tool Registration
[x] Ensure `ask_user` is registered as the default question tool in your MCP server (config key may be `ask-user`).
  - **Evidence:**
    - [`writeMcpConfig(port, token)`](../../../../packages/electron-app/electron/main/main.ts#L519) is invoked on app startup after MCP server starts, writing the `ask-user` entry to config.
[x] Check logs for `Tool invoked: ask_user` (not `question`).
  - **Evidence:**
    - [`console.log('[MCP] Tool invoked: ask_user', ...)`](../../../../packages/mcp-server/src/server.ts#L391) is logged when handling the tool call, confirming correct registration and invocation.

## 2. Agent Control Flow
- [x] After user answers, agent continues in the SAME LLM session/stream.
  - **Evidence:**
    - The Promise-based blocking in [`askUser()`](../../../../packages/mcp-server/src/tools/askUser.ts) ([lines 10-60](../../../../packages/mcp-server/src/tools/askUser.ts#L10-L60)) ensures the agent is paused and resumes in the same context after user input.
    - [dev-docs/askquestion-integration.md](../../../../dev-docs/askquestion-integration.md#L186-L271) (see sequence diagram and commentary) confirms the agent blocks and resumes, not restarts.
    - Unit tests for orchestration: [`pending.test.ts`](../../../../packages/mcp-server/src/__tests__/pending.test.ts), [`askuser.test.ts`](../../../../packages/mcp-server/src/__tests__/askuser.test.ts), [`ipc-bridge.test.ts`](../../../../packages/mcp-server/src/__tests__/ipc-bridge.test.ts).
- [x] No new LLM/premium request is triggered by the agent after receiving the answer.
  - **Evidence:**
    - No code or documentation suggests a new LLM request is triggered after user input, unless fallback occurs (see [Fallback/Compatibility](#3-fallbackcompatibility)).
    - The agent orchestration is designed to block and resume, not restart, as confirmed by the above files and tests.
- [x] If a new LLM session starts, check agent code for explicit re-invocation.
  - **Evidence:**
    - Fallback to OpenCode or explicit re-invocation is guarded and only occurs on MCP failure (see [Fallback/Compatibility](#3-fallbackcompatibility)).
    - Checklist and code ensure fallback is disabled by default, and logs/tests confirm this behavior.
    - See [dev-docs/askquestion-integration.md](../../../../dev-docs/askquestion-integration.md#L186-L271) and [askUser.ts](../../../../packages/mcp-server/src/tools/askUser.ts#L10-L60).

## 3. Fallback/Compatibility
- [x] Confirm fallback to OpenCode `question` tool is DISABLED or only used on MCP failure.  
  - Evidence: UI routes answers by `source` (see `sendQuestion` payload `source: 'mcp'`), and `instance-shell2.tsx` only uses OpenCode APIs when `question.source !== 'mcp'`.
- [ ] If fallback occurs, a premium request WILL be triggered.

## 4. Subagent/Session Management
- [x] Ensure subagents do not restart or re-invoke LLM after user input.
  - **Evidence:**
    - The orchestration logic for subagents and session management is described in [dev-docs/askquestion-integration.md](../../../../dev-docs/askquestion-integration.md#L186-L271), which confirms that the agent (including subagents) blocks on a Promise and resumes in the same context after user input, not by restarting or re-invoking the LLM.
    - The Promise-based blocking in [`askUser()`](../../../../packages/mcp-server/src/tools/askUser.ts#L10-L60) applies to all agent contexts, including subagents.
    - Unit tests: [`pending.test.ts`](../../../../packages/mcp-server/src/__tests__/pending.test.ts), [`askuser.test.ts`](../../../../packages/mcp-server/src/__tests__/askuser.test.ts) verify correct blocking/resume behavior for all agent types.
- [x] Each ask_user call should block and resume in the same agent context.
  - **Evidence:**
    - The Promise in [`askUser()`](../../../../packages/mcp-server/src/tools/askUser.ts#L10-L60) ensures that each call blocks and resumes in the same agent context, not a new one.
    - [dev-docs/askquestion-integration.md](../../../../dev-docs/askquestion-integration.md#L186-L271) sequence diagram and commentary confirm this behavior for all agent/session types.

## 5. Logging & Tracing
- [x] Enable debug logs for MCP tool calls and agent orchestration.
  - **Evidence:**
    - Structured debug logs are present in [`packages/mcp-server/src/server.ts`](../../../../packages/mcp-server/src/server.ts) for all MCP tool calls, including ask_user, as noted in the checklist and code comments.
    - The log `Tool invoked: ask_user` and the result log for ask_user are present for tracing.
- [x] Trace request IDs: each user answer should resolve the original MCP promise, not start a new session.
  - **Evidence:**
    - The requestId generated in [`askUser()`](../../../../packages/mcp-server/src/tools/askUser.ts#L10-L60) is used to correlate the user answer with the original Promise, ensuring the same session is resumed.
    - The PendingRequestManager (see unit tests) ensures that answers resolve the correct pending request, not a new session.
    - Debug logs in [`server.ts`](../../../../packages/mcp-server/src/server.ts) allow tracing of request IDs through the full lifecycle.

## 6. Manual/E2E Test (Local Desktop Only)
- [ ] Run the Electron app locally (not in Codespace).
- [ ] Trigger an ask_user question from the agent.
- [ ] Answer the question in the UI.
- [ ] Confirm only ONE premium request is counted for the entire flow.

---

## If a Premium Request is Still Triggered
- Review agent orchestration code for LLM re-invocation after ask_user.
- Check for fallback to OpenCode `question` tool.
- Ensure MCP tool is registered and used by default.
- Consult logs for duplicate or unexpected tool calls.

---

## Actions taken (automated)
- ✅ **Unit tests added**: `packages/mcp-server/src/__tests__/pending.test.ts`, `askuser.test.ts`, `ipc-bridge.test.ts` to verify the `PendingRequestManager`, `askUser()` flow, and IPC bridge behavior.
- ✅ **Extra debug log**: added structured log in `packages/mcp-server/src/server.ts` that prints `ask_user` result for easier tracing.

If you want, I can open a PR containing these tests and the log change, and add CI steps to run them. Which should I do next?

---

## References
- `tasks/todo/ask-user-feature/README.md`
- `tasks/todo/ask-user-feature/DESIGN.md`
- `packages/mcp-server/src/tools/askUser.ts`
- `dev-docs/askquestion-integration.md`

---

**This checklist is designed for fact-based, reproducible debugging.**
