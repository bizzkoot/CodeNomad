# ask_user Feature Documentation

This folder contains comprehensive documentation for implementing the native `cn_ask_user` MCP tool in CodeNomad.

## Documents

| Document                                           | Description                                                |
| -------------------------------------------------- | ---------------------------------------------------------- |
| [PRD.md](./PRD.md)                                 | Product Requirements Document - goals, scope, user stories |
| [DESIGN.md](./DESIGN.md)                           | Technical architecture and design decisions                |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Step-by-step implementation phases                         |
| [TASKS.md](./TASKS.md)                             | Detailed task breakdown with dependencies                  |
| [API_SPEC.md](./API_SPEC.md)                       | MCP tool API specification                                 |
| [REFERENCE_CODE.md](./REFERENCE_CODE.md)           | Code patterns from seamless-agent                          |

## Quick Summary

### Problem
OpenCode's `question` tool consumes an extra premium request per answer due to its session loop architecture.

### Solution
Implement a native `cn_ask_user` MCP tool that:
1. Uses MCP SDK for tool registration
2. Returns results within the same LLM stream
3. Integrates with CodeNomad's existing question wizard UI
4. **Saves 1 premium request per question**

### Estimated Effort
~3.5 days

### Key Files to Create

```
packages/mcp-server/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server.ts
    ├── pending.ts
    ├── tools/
    │   ├── index.ts
    │   ├── askUser.ts
    │   └── schemas.ts
    ├── bridge/
    │   ├── types.ts
    │   └── ipc.ts
    └── config/
        └── registration.ts
```

### Key Files to Modify

- `packages/ui/src/stores/questions.ts` - Add source tracking
- `packages/ui/src/components/instance/instance-shell2.tsx` - Route by source
- `packages/ui/src/lib/mcp-bridge.ts` - NEW: IPC bridge for renderer
- `packages/electron-app/electron/main/main.ts` - Start MCP server

## Getting Started

1. Read [PRD.md](./PRD.md) for requirements
2. Review [DESIGN.md](./DESIGN.md) for architecture
3. Follow [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) phase by phase
4. Track progress in [TASKS.md](./TASKS.md)

## Dependencies

```json
{
    "@modelcontextprotocol/sdk": "^1.25.2",
    "zod": "^4.1.13"
}
```

## Reference

- [seamless-agent](https://github.com/jraylan/seamless-agent) - Reference implementation
- Cloned to: `/Users/muhammadfaiz/Custom APP/CodeNomad/temp/seamless-agent`
