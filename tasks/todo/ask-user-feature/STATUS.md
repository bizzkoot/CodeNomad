# MCP Integration Status

## ✅ Successfully Completed

### 1. Configuration Injection
- **Modified**: `packages/electron-app/electron/main/process-manager.ts`
  - Added `mcpPort` parameter to `StartOptions`
  - Injects `OPENCODE_CONFIG_CONTENT` environment variable with MCP server configuration
  - Successfully passes config to OpenCode process

- **Modified**: `packages/electron-app/electron/main/main.ts`
  - Refactored startup sequence to start MCP server BEFORE CLI
  - Passes MCP port to the process manager
  - MCP server listens on dynamic port (e.g., 52252, 52130)

### 2. MCP Server Connection
- **Fixed**: `packages/mcp-server/src/server.ts`
  - Removed authentication requirement for localhost connections
  - Routes ALL requests (including root `/`) to MCP transport
  - Added CORS headers
  - Added request logging

**Evidence from logs:**
```
[MCP] Request: POST /
[MCP] Forwarding to transport: POST /
```

### 3. Tool Discovery
OpenCode successfully discovers and attempts to call the tool:
- Tool name: `codenomad-ask-user_ask_user`
- The LLM can see and attempt to invoke the tool

## ❌ Current Issue

### Zod Schema Validation Error in MCP SDK
**Error**: `v3Schema.safeParseAsync is not a function`

**Root Cause Analysis:**
The error occurs **inside the MCP SDK's internal validation**, not in our server code. The SDK attempts to call `safeParseAsync()` on Zod schemas, but this method doesn't exist in Zod 3.25.76.

**Evidence:**
1. All Zod versions are consistent (3.25.76) - no version conflict
2. Removed manual Zod validation from our tool handler - error persists
3. MCP server successfully receives and routes requests
4. Error occurs before our tool handler executes
5. Logs show: `[MCP] Request: POST /` but never `[MCP] Tool invoked: ask_user`

**Technical Details:**
- MCP SDK version: `@modelcontextprotocol/sdk@1.25.2`
- SDK peer dependencies: `{ zod: '^3.25 || ^4.0' }`
- Our Zod version: `3.25.76` (within range)
- Method `safeParseAsync` was added in Zod v3.22 but may have been renamed/removed

**What We Tried:**
1. ✅ Downgraded from Zod v4 to v3.23.0
2. ✅ Removed manual Zod `.parse()` calls from tool handler
3. ✅ Verified no dependency conflicts (`npm ls zod`)
4. ✅ Rebuilt the MCP server package multiple times
5. ❌ Error persists in SDK's validation layer

### Possible Solutions

**Option 1: Contact MCP SDK Maintainers**
- Report the `safeParseAsync` compatibility issue
- Ask if there's a different Zod version that works
- Request documentation on which Zod methods the SDK expects

**Option 2: Use OpenCode's Native `question` Tool**
- CodeNomad already has the `question` tool working
- UI integration is complete (question wizard exists)
- Only downside: incurs extra premium LLM requests for the answer flow

**Option 3: Wait for SDK Updates**
- The MCP SDK is actively developed
- Future versions may fix Zod compatibility
- Monitor `@modelcontextprotocol/sdk` releases

**Option 4: Bypass MCP Entirely** (Complex)
- Modify OpenCode source code directly to add the tool
- Requires maintaining a fork of OpenCode
- Not recommended due to maintenance burden

**Recommendation:** Use Option 2 (native `question` tool) while monitoring Option 3 (SDK updates).

## Architecture Summary

```
Electron Main Process
  ├─> MCP Server (port 52252) ─────────┐
  │   └─> Tool: ask_user                │
  │                                     │
  └─> OpenCode Process                  │
      └─> OPENCODE_CONFIG_CONTENT ──────┘
          connects to 127.0.0.1:52252
```

**Flow:**
1. Electron starts MCP server on random port
2. Electron injects config via `OPENCODE_CONFIG_CONTENT` env var
3. OpenCode reads config and connects to MCP server
4. LLM calls `codenomad-ask-user_ask_user` tool
5. **ERROR** occurs during argument validation

## Files Modified

- `packages/electron-app/electron/main/main.ts`
- `packages/electron-app/electron/main/process-manager.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/package.json` (Zod version)
- `packages/ui/src/components/instance/instance-shell2.tsx` (previous routing fix)
- `packages/ui/src/types/question.ts` (whitespace fix)
