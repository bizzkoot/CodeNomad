# PRD: Native `ask_user` Tool for CodeNomad

**Version:** 1.0  
**Author:** AI Assistant  
**Date:** 2026-01-18  
**Status:** Draft  

---

## Executive Summary

This PRD outlines the implementation of a native `ask_user` tool for CodeNomad that allows AI agents to ask questions to users **without consuming additional premium LLM requests**. This is achieved by implementing an MCP (Model Context Protocol) server that returns tool results within the same LLM request stream.

---

## Problem Statement

### Current Behavior

When using OpenCode's built-in `question` tool in CodeNomad:

1. User sends a prompt → **1 premium request**
2. LLM decides to use `question` tool
3. Tool blocks waiting for user answer
4. User answers
5. Session loop continues → **1 additional premium request** (to process tool result)
6. Total: **2 premium requests** for a simple Q&A

### Root Cause

OpenCode uses a **session loop architecture** that calls `streamText()` after each tool completion:

```typescript
// In processor.ts
return "continue"  // Triggers new streamText() call = new premium request
```

### Desired Behavior

Following seamless-agent's approach:

1. User sends a prompt → **1 premium request**
2. LLM calls `ask_user` tool via MCP
3. Tool blocks waiting for user answer
4. User answers
5. Tool returns result **within the same LLM stream**
6. Total: **1 premium request**

---

## Goals & Success Metrics

### Primary Goals

| Goal   | Description                                                               |
| ------ | ------------------------------------------------------------------------- |
| **G1** | Reduce premium request consumption when using question tools              |
| **G2** | Maintain seamless UX with CodeNomad's existing question wizard            |
| **G3** | Support all existing question types (text, select, multi-select, confirm) |
| **G4** | Work with GitHub Copilot and other LLM providers via MCP                  |

### Success Metrics

| Metric                        | Target                       | How to Measure                  |
| ----------------------------- | ---------------------------- | ------------------------------- |
| Premium requests per question | 0 extra                      | Monitor Copilot usage dashboard |
| Question response latency     | < 100ms (after user answers) | Instrumentation                 |
| UI consistency                | 100% same look               | Visual comparison               |
| Tool availability             | 99.9% uptime                 | MCP server health checks        |

---

## User Stories

### US1: Ask User for Clarification
**As an** AI agent using CodeNomad  
**I want to** ask the user clarifying questions  
**So that** I can proceed with accurate information without consuming extra requests

**Acceptance Criteria:**
- [ ] Agent can call `ask_user` tool
- [ ] Question appears in CodeNomad's question wizard
- [ ] User can answer with text, selection, or custom input
- [ ] Agent receives answer in same LLM stream
- [ ] No additional premium request is consumed

### US2: Confirm Before Action
**As an** AI agent  
**I want to** confirm with the user before destructive actions  
**So that** the user stays in control

**Acceptance Criteria:**
- [ ] Agent can ask yes/no confirmation questions
- [ ] User can approve or reject
- [ ] Rejection gracefully handled without extra request

### US3: Multi-Question Flow
**As an** AI agent  
**I want to** ask multiple related questions at once  
**So that** I gather all needed information efficiently

**Acceptance Criteria:**
- [ ] Agent can send array of questions
- [ ] Questions displayed in sequence or as form
- [ ] All answers returned together
- [ ] Still only 1 premium request total

---

## Scope

### In Scope

| Feature                                      | Priority |
| -------------------------------------------- | -------- |
| MCP server with `ask_user` tool           | P0       |
| Integration with existing question wizard UI | P0       |
| Auto-registration with Antigravity/Copilot   | P0       |
| Authentication/security for MCP endpoints    | P0       |
| Support for text questions                   | P0       |
| Support for single-select questions          | P0       |
| Support for multi-select questions           | P1       |
| Support for confirmation (yes/no)            | P1       |
| Question timeout handling                    | P2       |
| Cancellation support                         | P2       |

### Out of Scope (v1)

| Feature                              | Reason              |
| ------------------------------------ | ------------------- |
| Image/file attachments in questions  | Future enhancement  |
| Replacing OpenCode's `question` tool | Keep as fallback    |
| Non-MCP implementations              | MCP is the standard |
| Custom question UI themes            | Follow existing UI  |

---

## Technical Constraints

### Must Have

1. **MCP SDK Compatibility**: Use `@modelcontextprotocol/sdk` for standard compliance
2. **Electron Compatibility**: Work within CodeNomad's Electron environment
3. **Existing UI Reuse**: Use existing question wizard components, not new UI
4. **Security**: Authenticate MCP requests with bearer tokens

### Should Have

1. **Graceful Degradation**: Fall back to OpenCode's question tool if MCP fails
2. **Logging**: Comprehensive logging for debugging
3. **Metrics**: Track usage and performance

---

## Dependencies

### External Dependencies

| Dependency                  | Version | Purpose                   |
| --------------------------- | ------- | ------------------------- |
| `@modelcontextprotocol/sdk` | ^1.25.2 | MCP server implementation |
| `zod`                       | ^4.x    | Input validation          |

### Internal Dependencies

| Component                                                 | Purpose                            |
| --------------------------------------------------------- | ---------------------------------- |
| `packages/ui/src/stores/questions.ts`                     | Reuse question queue logic         |
| `packages/ui/src/components/instance/instance-shell2.tsx` | Question wizard UI                 |
| `packages/server`                                         | Server integration for MCP startup |

---

## Risks & Mitigations

| Risk                              | Likelihood | Impact | Mitigation                            |
| --------------------------------- | ---------- | ------ | ------------------------------------- |
| MCP not supported by LLM provider | Low        | High   | Fall back to OpenCode's question tool |
| MCP server crashes                | Medium     | Medium | Health checks, auto-restart           |
| Security vulnerabilities          | Low        | High   | Token auth, localhost-only binding    |
| UI inconsistency                  | Low        | Medium | Reuse existing components             |
| Performance issues                | Low        | Medium | Optimize WebSocket communication      |

---

## Timeline (Estimated)

| Phase                       | Duration     | Deliverable                       |
| --------------------------- | ------------ | --------------------------------- |
| **Phase 1: Setup**          | 0.5 days     | MCP server package scaffolding    |
| **Phase 2: Core Tool**      | 1 day        | `cn_ask_user` tool implementation |
| **Phase 3: UI Integration** | 1 day        | Connect to question wizard        |
| **Phase 4: Testing**        | 0.5 days     | E2E testing with Copilot          |
| **Phase 5: Polish**         | 0.5 days     | Error handling, logging           |
| **Total**                   | **3.5 days** |                                   |

---

## Open Questions

1. **Tool Name**: Should it be `cn_ask_user`, `codenomad_ask_user`, or something else?
2. **Fallback**: Should we automatically fall back to OpenCode's `question` if MCP fails?
3. **Multi-instance**: How to handle multiple CodeNomad instances?
4. **Timeout**: What should happen if user doesn't answer within X minutes?

---

## Appendix

### Reference Implementation

See [seamless-agent](https://github.com/jraylan/seamless-agent) for the reference implementation:
- `src/tools/index.ts` - Tool registration
- `src/tools/askUser.ts` - Tool implementation
- `src/mcp/mcpServer.ts` - MCP server setup

### Related Documents

- [DESIGN.md](./DESIGN.md) - Technical architecture
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - Step-by-step implementation
- [TASKS.md](./TASKS.md) - Detailed task breakdown
- [API_SPEC.md](./API_SPEC.md) - MCP tool API specification
