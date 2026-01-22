# ask_user MCP Tool: Premium Request Debug Checklist

## Purpose
This checklist helps you verify that the native `ask_user` tool in CodeNomad does NOT trigger a premium LLM request per user answer. Use it to debug and confirm correct agent orchestration.

**Note:** The tool name is `ask_user` (with underscore) in all code logic, schemas, and UI. The name `ask-user` (with dash) is only used as a config key for MCP server registration.

---

## 1. Confirm MCP Tool Registration
- [x] Ensure `ask_user` is registered as the default question tool in your MCP server (config key may be `ask-user`).  
  - Evidence: `writeMcpConfig()` is invoked on app startup (`packages/electron-app/electron/main/main.ts`) and writes `ask-user` entry.
- [x] Check logs for `Tool invoked: ask_user` (not `question`).  
  - Evidence: `packages/mcp-server/src/server.ts` logs `Tool invoked: ask_user` when handling `tools/call`.

## 2. Agent Control Flow
- [ ] After user answers, agent continues in the SAME LLM session/stream.
- [ ] No new LLM/premium request is triggered by the agent after receiving the answer.
- [ ] If a new LLM session starts, check agent code for explicit re-invocation.

## 3. Fallback/Compatibility
- [x] Confirm fallback to OpenCode `question` tool is DISABLED or only used on MCP failure.  
  - Evidence: UI routes answers by `source` (see `sendQuestion` payload `source: 'mcp'`), and `instance-shell2.tsx` only uses OpenCode APIs when `question.source !== 'mcp'`.
- [ ] If fallback occurs, a premium request WILL be triggered.

## 4. Subagent/Session Management
- [ ] Ensure subagents do not restart or re-invoke LLM after user input.
- [ ] Each ask_user call should block and resume in the same agent context.

## 5. Logging & Tracing
- [ ] Enable debug logs for MCP tool calls and agent orchestration.
- [ ] Trace request IDs: each user answer should resolve the original MCP promise, not start a new session.

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
