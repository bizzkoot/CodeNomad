# SOLUTION: Direct MCP Integration in CodeNomad

## The Brilliant Idea

Instead of relying on Antigravity to discover our MCP server, **CodeNomad can connect to its own MCP server directly!**

---

## New Architecture

```
┌──────────────────────────────────────────────────────────┐
│              CodeNomad Electron App                       │
│                                                           │
│  ┌─────────────────┐         ┌──────────────────────┐    │
│  │  Main Process   │◄───────►│  Renderer (UI)       │    │
│  │  - Starts MCP   │  IPC    │  - Question Wizard   │    │
│  │    Server       │         │                      │    │
│  └────────┬────────┘         └──────────────────────┘    │
│           │                                               │
│           │ Spawns                                        │
│           ▼                                               │
│  ┌─────────────────────────────────────┐                 │
│  │  MCP Server (localhost:PORT)        │                 │
│  │  - ask_user tool                    │                 │
│  │  - IPC bridge to UI ────────────────┘ (already done!)│
│  └──────────────┬──────────────────────┘                 │
└─────────────────┼──────────────────────────────────────┘
                  │
                  │ MCP Protocol (HTTP/SSE)
                  ▼
         ┌────────────────────────┐
         │  OpenCode Server       │
         │  + MCP Client          │  ← NEW: Add MCP client
         │                        │
         │  When tool needed:     │
         │  1. Connect to MCP     │
         │  2. Call ask_user      │
         │  3. Get answer         │
         │  4. Return to LLM      │
         └────────┬───────────────┘
                  │
                  │ HTTP/API
                  ▼
         ┌────────────────────────┐
         │  LLM Provider          │
         │  (Copilot, etc.)       │
         └────────────────────────┘
```

---

## How It Works

### 1. Startup Sequence

```typescript
// In CodeNomad Main Process (main.ts)

1. Start MCP Server on random port (e.g., 52341)
   ✅ Already implemented!

2. Pass MCP server URL to OpenCode via environment variable:
   process.env.CODENOMAD_MCP_URL = "http://localhost:52341"

3. Start OpenCode server process
   ✅ Already implemented!
```

### 2. OpenCode Side (NEW - needs implementation)

```typescript
// In packages/server/src/mcp/client.ts (NEW FILE)

import { MCPClient } from '@modelcontextprotocol/sdk/client';

class CodeNomadMcpClient {
    private client: MCPClient;
    
    async connect() {
        const mcpUrl = process.env.CODENOMAD_MCP_URL;
        if (!mcpUrl) {
            console.warn('No MCP server URL provided');
            return;
        }
        
        this.client = new MCPClient({
            url: mcpUrl,
            transport: 'http'
        });
        
        await this.client.connect();
        console.log('[OpenCode] Connected to CodeNomad MCP server');
    }
    
    async askUser(questions: Question[]): Promise<Answer[]> {
        const result = await this.client.callTool('ask_user', {
            questions
        });
        return result.answers;
    }
}
```

### 3. Replace OpenCode's Question Tool

```typescript
// In packages/server/src/tool/index.ts (MODIFY)

// OLD: Built-in question tool that consumes extra requests
// tools.register('question', openCodeQuestionTool);

// NEW: MCP-backed question tool
import { mcpClient } from './mcp/client';

tools.register('ask_user', {
    description: 'Ask user questions (via MCP - no extra requests!)',
    schema: askUserSchema,
    execute: async (params) => {
        // Call MCP server instead of local handling
        const answers = await mcpClient.askUser(params.questions);
        
        // Return immediately - MCP handles the blocking
        return { answers };
    }
});
```

---

## Key Advantages

### ✅ No Antigravity Dependency
- CodeNomad connects to its own MCP server
- No need for Antigravity config discovery
- Works standalone

### ✅ Zero Extra Premium Requests
- MCP server handles blocking until user responds
- Result returned within same LLM stream
- Same benefit as seamless-agent

### ✅ Reuse Existing Code
- MCP server already built ✅
- IPC bridge already built ✅
- Question wizard UI already exists ✅

### ✅ Clean Architecture
- Separation of concerns
- OpenCode doesn't need UI knowledge
- MCP server handles UI communication

---

## Implementation Steps

### Phase 1: Connect OpenCode to MCP (NEW)

**Files to create:**
```
packages/server/src/mcp/
├── client.ts           # MCP client wrapper
└── index.ts            # Export client
```

**Dependencies to add:**
```json
{
    "@modelcontextprotocol/sdk": "^1.25.2"
}
```

**Code:**
```typescript
// packages/server/src/mcp/client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export class CodeNomadMcpClient {
    private client: Client | null = null;
    private transport: StreamableHTTPClientTransport | null = null;
    
    async connect(): Promise<void> {
        const mcpUrl = process.env.CODENOMAD_MCP_URL;
        if (!mcpUrl) {
            throw new Error('CODENOMAD_MCP_URL not set');
        }
        
        this.client = new Client({
            name: "OpenCode",
            version: "1.0.0"
        });
        
        this.transport = new StreamableHTTPClientTransport({
            url: mcpUrl
        });
        
        await this.client.connect(this.transport);
    }
    
    async callTool(toolName: string, params: any): Promise<any> {
        if (!this.client) {
            throw new Error('MCP client not connected');
        }
        
        const result = await this.client.callTool({
            name: toolName,
            arguments: params
        });
        
        return JSON.parse(result.content[0].text);
    }
}

export const mcpClient = new CodeNomadMcpClient();
```

### Phase 2: Pass MCP URL to OpenCode

**File:** `packages/electron-app/electron/main/process-manager.ts`

```typescript
// In buildCliArgs() method, add environment variable
private buildCliArgs(options: StartOptions, host: string, mcpPort: number): string[] {
    const args = ["serve", "--host", host, "--port", "0"];
    
    // NEW: Pass MCP server URL
    process.env.CODENOMAD_MCP_URL = `http://127.0.0.1:${mcpPort}`;
    
    if (options.dev) {
        args.push("--ui-dev-server", "http://localhost:3000", "--log-level", "debug");
    }
    
    return args;
}
```

**File:** `packages/electron-app/electron/main/main.ts`

```typescript
// After starting MCP server
const mcpPort = mcpServer.getPort();
if (mcpPort) {
    // Start OpenCode with MCP port
    await cliManager.start({ 
        dev: isDev,
        mcpPort: mcpPort  // NEW: Pass MCP port
    });
}
```

### Phase 3: Register MCP Tool in OpenCode

**File:** `packages/server/src/index.ts` or wherever tools are registered

```typescript
import { mcpClient } from './mcp/client';

// On server startup
await mcpClient.connect();
console.log('[OpenCode] Connected to CodeNomad MCP server');

// Register ask_user tool that uses MCP
tools.register('ask_user', {
    description: 'Ask user for input via CodeNomad UI',
    schema: {
        type: 'object',
        properties: {
            questions: {
                type: 'array',
                items: { /* ... */ }
            }
        }
    },
    execute: async (params) => {
        const result = await mcpClient.callTool('ask_user', params);
        return result;
    }
});
```

---

## Flow Example

**User asks:** "Create a new component"

```
1. LLM decides to call ask_user tool
   
2. OpenCode receives tool call
   ├─ Instead of local question handler
   └─ Calls MCP server via HTTP
   
3. MCP Server receives ask_user call
   ├─ Creates pending request
   └─ Sends to Electron via IPC
   
4. Electron Main Process
   ├─ Forwards to Renderer
   └─ Shows question wizard
   
5. User answers in UI
   ├─ Renderer → Main (IPC)
   └─ Main → MCP Server (resolve promise)
   
6. MCP Server
   ├─ Returns answer to OpenCode
   └─ OpenCode returns to LLM
   
7. LLM continues (SAME STREAM!)
   └─ No extra premium request! ✅
```

---

## Comparison with Current Approach

| Aspect               | Current (Antigravity MCP) | New (Direct MCP) |
| -------------------- | ------------------------- | ---------------- |
| MCP Server           | ✅ Already built           | ✅ Same server    |
| Discovery            | ❌ Via Antigravity config  | ✅ Direct URL     |
| OpenCode Integration | ❌ Not connected           | ✅ MCP client     |
| Works Standalone     | ❌ Needs Antigravity       | ✅ Yes!           |
| Premium Requests     | N/A (not working)         | ✅ Zero extra     |

---

## Estimated Effort

| Task                | Time       | Status |
| ------------------- | ---------- | ------ |
| MCP Server          | 0 days     | ✅ Done |
| IPC Bridge          | 0 days     | ✅ Done |
| OpenCode MCP Client | 0.5 days   | 🔄 TODO |
| Pass MCP URL        | 0.5 days   | 🔄 TODO |
| Testing             | 1 day      | 🔄 TODO |
| **Total**           | **2 days** |        |

---

## Next Steps

1. Add `@modelcontextprotocol/sdk` to `packages/server/package.json`
2. Create `packages/server/src/mcp/client.ts`
3. Modify `main.ts` to pass MCP URL to OpenCode
4. Register `ask_user` tool in OpenCode using MCP client
5. Test end-to-end flow

---

## Testing Plan

1. Start CodeNomad
2. Verify MCP server starts and gets port
3. Verify OpenCode receives MCP URL
4. Ask LLM to use ask_user tool
5. Verify question appears in CodeNomad UI
6. Answer question
7. Verify answer reaches LLM without extra request

---

## Potential Issues

### Issue 1: MCP SDK Compatibility
**Risk:** MCP SDK client might need different version than server
**Mitigation:** Test with same version, update if needed

### Issue 2: OpenCode Startup Timing
**Risk:** OpenCode might try to connect before MCP server is ready
**Mitigation:** Add retry logic with timeout

### Issue 3: Tool Name Conflicts
**Risk:** Both `question` and `ask_user` available
**Mitigation:** Deprecate `question` tool or only expose `ask_user`

---

## Summary

**YES, this approach is not only possible but IDEAL!**

The MCP server we built isn't wasted - we just need to connect OpenCode to it directly instead of relying on Antigravity for discovery.

**The architecture makes perfect sense:**
- MCP Server = Bridge between OpenCode and UI
- No Antigravity dependency
- Clean separation of concerns
- Zero extra premium requests

**Ready to proceed with implementation?**
