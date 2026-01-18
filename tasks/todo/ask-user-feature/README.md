# ask_user Feature Documentation

## 🎉 STATUS: ✅ PRODUCTION READY (2026-01-18)

The native `ask_user` MCP tool has been **successfully implemented and tested**. All core functionality is working with **zero premium token cost**.

---

This folder contains comprehensive documentation for the native `ask_user` MCP tool in CodeNomad.

## Documents

| Document                                           | Description                                                | Status              |
| -------------------------------------------------- | ---------------------------------------------------------- | ------------------- |
| [PRD.md](./PRD.md)                                 | Product Requirements Document - goals, scope, user stories | ✅                   |
| [DESIGN.md](./DESIGN.md)                           | Technical architecture and design decisions                | ✅                   |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Step-by-step implementation phases                         | ✅                   |
| [TASKS.md](./TASKS.md)                             | Detailed task breakdown with dependencies                  | ✅ Completed         |
| [API_SPEC.md](./API_SPEC.md)                       | MCP tool API specification                                 | ✅                   |
| [REFERENCE_CODE.md](./REFERENCE_CODE.md)           | Code patterns from seamless-agent                          | ✅                   |
| [STATUS.md](./STATUS.md)                           | Implementation status and testing results                  | ✅ All tests passing |

## Quick Summary

### Problem
OpenCode's `question` tool consumes an extra premium request per answer due to its session loop architecture.

### Solution ✅ IMPLEMENTED
Implemented a native `ask_user` MCP tool that:
1. ✅ Uses **raw JSON-RPC 2.0** (bypassing MCP SDK's Zod validation bug)
2. ✅ Returns results within the same LLM stream via **Electron IPC**
3. ✅ Integrates with CodeNomad's existing question wizard UI
4. ✅ **Saves 1 premium request per question** - $0.00 token cost confirmed

### Live Testing Results

**Test 1 - Basic Text Input:** ✅ Passed  
**Test 2 - Multi-Question Dialog:** ✅ Passed  
- Single-select (radio buttons)
- Multi-select (checkboxes)
- Text input with placeholders

**IPC Communication:** ✅ Verified  
**Premium Token Cost:** ✅ $0.00 confirmed

### Implementation Approach

**Raw JSON-RPC Implementation** - We bypassed the MCP SDK entirely due to a Zod validation bug, implementing the MCP protocol directly over HTTP. This proved to be simpler and more reliable.

**Electron IPC Bridge** - Questions are sent from the MCP server to the UI via IPC events, and answers are returned the same way, avoiding the web API proxy entirely.

### Key Files Created

```
packages/mcp-server/
├── package.json (removed SDK dependency)
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server.ts (raw JSON-RPC handler)
    ├── pending.ts (PendingRequestManager)
    ├── tools/
    │   └── askUser.ts
    └── bridge/
        └── ipc.ts (Electron IPC integration)
```

### Key Files Modified

- ✅ `packages/ui/src/stores/questions.ts` - Add source tracking
- ✅ `packages/ui/src/components/instance/instance-shell2.tsx` - Route by source
- ✅ `packages/ui/src/lib/mcp-bridge.ts` - IPC bridge for renderer
- ✅ `packages/electron-app/electron/main/main.ts` - Start MCP server
- ✅ `packages/electron-app/electron/preload/index.cjs` - Expose IPC to renderer

## Getting Started

1. Read [PRD.md](./PRD.md) for requirements
2. Review [DESIGN.md](./DESIGN.md) for architecture
3. Check [STATUS.md](./STATUS.md) for implementation details
4. See [TASKS.md](./TASKS.md) for completed work breakdown

## Dependencies

```json
{
    "zod": "^4.1.13"
}
```

**Note:** `@modelcontextprotocol/sdk` was **removed** - we use raw JSON-RPC 2.0 instead.

## Reference

- [seamless-agent](https://github.com/jraylan/seamless-agent) - Reference implementation
- [MCP Specification](https://modelcontextprotocol.io) - Official MCP docs

