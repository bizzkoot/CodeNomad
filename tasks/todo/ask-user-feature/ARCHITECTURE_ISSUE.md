# CRITICAL ARCHITECTURE ISSUE: MCP Tool Not Available

## Problem Summary

The `ask_user` MCP tool **will not work** in CodeNomad as currently implemented because of a **fundamental architectural mismatch**.

---

## CodeNomad's Actual Architecture

```
┌─────────────────────────────────────────────────────┐
│         CodeNomad (Electron App)                    │
│                                                     │
│  ┌──────────────┐        ┌────────────────────┐    │
│  │  Main        │        │  Renderer (UI)     │    │
│  │  Process     │◄──────►│  SolidJS/React     │    │
│  └──────┬───────┘        └────────────────────┘    │
└─────────┼──────────────────────────────────────────┘
          │
          │ Spawns as child process
          ▼
┌─────────────────────────────────────┐
│  OpenCode Server                    │
│  (@neuralnomads/codenomad/dist/bin.js)              │
│                                                     │
│  - Runs in separate Node process                   │
│  - Has its own tool registry                        │
│  - Communicates with LLM APIs                       │
│  - Exposes HTTP API to Electron                     │
└─────────────────────────────────────┘
          │
          │ HTTP/SSE to LLM
          ▼
┌─────────────────────────────────────┐
│  LLM Provider                       │
│  (GitHub Copilot, Anthropic, etc.)  │
└─────────────────────────────────────┘
```

---

## Why MCP Tool Isn't Available

### What We Implemented

1. **MCP Server** - Registers with `~/.gemini/antigravity/mcp_config.json`
2. **Tool Name**: `ask_user`
3. **Expected User**: Antigravity IDE (which reads MCP config and connects to MCP servers)

### The Problem

**CodeNomad is NOT Antigravity!**

- **CodeNomad** = Standalone Electron app
- **Antigravity** = Google's AI IDE that uses MCP for tool discovery

CodeNomad does NOT:
- Read `~/.gemini/antigravity/mcp_config.json`
- Connect to MCP servers
- Use MCP protocol for tools

CodeNomad DOES:
- Spawn OpenCode as a separate process
- Use OpenCode's built-in tool registry
- Communicate via HTTP/SSE with OpenCode server

---

## Where Did We Go Wrong?

The documentation and implementation were designed for **Antigravity integration**, not CodeNomad's architecture.

From `README.antigravity.md` in seamless-agent:
```
## Requirements
- **Antigravity 1.104.0 or higher**
- Node.js (required for MCP server integration with Antigravity)
```

This clearly states it's for Antigravity, not standalone Electron apps!

---

## OpenCode's Tool Architecture

Looking at OpenCode's code (from temp/opencode):

```
OpenCode registers tools internally in:
packages/opencode/src/tool/index.ts

Tools available:
- question
- bash
- read_file
- write_file
- etc.
```

The LLM sees whatever tools OpenCode exposes via its HTTP API.

---

## Why MCP Server Writes to Antigravity Config

The MCP server registration writes to:
```
~/.gemini/antigravity/mcp_config.json
```

This file is ONLY read by Antigravity IDE, not by CodeNomad or OpenCode.

---

## Two Possible Solutions

### Solution A: Modify OpenCode's Question Tool (Recommended)

Instead of creating a separate MCP server, modify OpenCode's existing `question` tool to not consume extra requests.

**Files to modify in OpenCode:**
1. `packages/opencode/src/session/processor.ts`
   - Detect `question` tool and return `"stop"` instead of `"continue"`

2. `packages/opencode/src/session/prompt.ts`
   - Handle stopped question tool specially

3. `packages/opencode/src/tool/question.ts`
   - Inject answer as synthetic user message

**Pros:**
- Works with CodeNomad's existing architecture
- No MCP complexity needed
- Fixes root cause in OpenCode

**Cons:**
- Requires modifying OpenCode (upstream dependency)
- May break other use cases

---

### Solution B: Add Custom Tool to OpenCode Instance

Register a new tool directly with CodeNomad's OpenCode instance.

**Implementation:**
1. Create a new tool in `packages/server` (CodeNomad's fork of OpenCode)
2. Register it with OpenCode's tool registry
3. Have it communicate back to Electron via HTTP callback

**Files to modify:**
```
packages/server/src/tools/askUser.ts  (NEW)
packages/server/src/tool/index.ts     (MODIFY - register tool)
```

**Pros:**
- Stays within CodeNomad's architecture
- No dependency on Antigravity

**Cons:**
- Still has the session loop issue
- Still consumes extra requests

---

## Solution C: Accept Current Behavior

Recognize that the premium request consumption is inherent to how LLM tool calls work with stateless APIs.

---

## What About the Current Implementation?

The current MCP server implementation (`packages/mcp-server`) will:

✅ Start successfully when CodeNomad launches
✅ Register in `mcp_config.json`
✅ Listen on a port
❌ **Never be discovered by CodeNomad/OpenCode**
❌ **Never be used by the LLM**

Because:
- CodeNomad doesn't read MCP config
- OpenCode doesn't connect to MCP servers
- The LLM only sees tools OpenCode exposes

---

## Recommended Path Forward

### Option 1: For Antigravity Users Only

If users have Antigravity IDE:
1. Keep current MCP implementation
2. Document that this feature only works with Antigravity
3. CodeNomad users must use Antigravity to access the tool

### Option 2: Integrate into OpenCode Properly

1. Fork OpenCode to `packages/server` (if not already)
2. Add `ask_user` as a native OpenCode tool
3. Modify session loop to handle it specially
4. No MCP needed

### Option 3: Hybrid Approach

1. Keep MCP server for Antigravity compatibility
2. Also register tool with OpenCode
3. Both paths available

---

## Immediate Actions Needed

1. **Update documentation** to clarify this is for Antigravity, not CodeNomad
2. **Decide on architecture**: MCP-only, OpenCode-integrated, or hybrid
3. **If MCP-only**: Add clear warning that CodeNomad users need Antigravity
4. **If OpenCode-integrated**: Stop MCP work, focus on OpenCode fork

---

## Questions to Answer

1. **Do CodeNomad users use Antigravity IDE?**
   - If yes → Current approach works for them
   - If no → Current approach is useless

2. **Can you modify OpenCode's code?**
   - If yes → Implement Solution B
   - If no → Accept current behavior or use Antigravity

3. **What's the actual use case?**
   - Antigravity users → MCP approach correct
   - CodeNomad standalone users → Need OpenCode modification
