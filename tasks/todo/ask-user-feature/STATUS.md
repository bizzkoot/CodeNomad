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

### Zod Schema Validation Error
**Error**: `v3Schema.safeParseAsync is not a function`

**What we tried:**
1. Downgraded Zod from v4.1.13 to v3.23.0 in `packages/mcp-server`
2. Rebuilt the MCP server package
3. Restarted CodeNomad

**Still persists**, suggesting:
- Possible dependency conflict in the monorepo
- MCP SDK might be using a bundled/different Zod version
- Multiple Zod versions in the dependency tree

### Next Steps to Investigate
1. Check for multiple Zod installations:
   ```bash
   npm ls zod
   ```

2. Verify MCP SDK's Zod dependency:
   ```bash
   npm view @modelcontextprotocol/sdk dependencies
   ```

3. Consider removing `node_modules` and reinstalling:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

4. Alternative: Use plain JSON validation instead of Zod schemas in MCP tool registration

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
