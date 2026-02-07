# PRD: Multi-instance MCP `ask_user` registration (namespaced servers)

**Status:** Draft

**Owner:** CodeNomad

**Last updated:** 2026-02-07

## Summary
CodeNomad currently registers its MCP `ask_user` integration by writing a single global entry in Antigravity’s MCP config file (`~/.gemini/antigravity/mcp_config.json`) under the key `mcpServers['ask-user']`. When multiple Electron app processes run concurrently, the last one to start overwrites that key, and any instance exiting can delete the key, causing unsafe cross-routing and broken external integrations.

This PRD defines a reliable multi-instance strategy using **namespaced per-instance registrations** (Option 2) with a **minimal safety harness** to avoid accidental deregistration and config clobbering.

## Background / Context
- Each CodeNomad Electron process starts an MCP server with a random port and token.
- Electron calls `writeMcpConfig(port, token, mcpServerPath)` and writes to a single global file: `~/.gemini/antigravity/mcp_config.json`.
- Internal CodeNomad tool calls are already per-instance isolated via `OPENCODE_CONFIG_CONTENT` and the per-instance `mcpPort`.
- The multi-instance issue affects **external Antigravity clients** that rely on `mcp_config.json`.

### Verified current behavior (repo sources)
- Global config path and registration logic: `packages/mcp-server/src/config/registration.ts`.
- Electron calls registration and unregister on quit: `packages/electron-app/electron/main/main.ts`.
- Current unregister deletes `mcpServers['ask-user']` unconditionally.
- Current writer uses a fixed temp file (`mcp_config.json.tmp`), which is unsafe under concurrent writers.

## Problem Statement
When two CodeNomad instances run concurrently:
1. **Last writer wins**: the most recently started instance overwrites `mcpServers['ask-user']`.
2. **Unsafe deregistration**: any instance exiting can delete the canonical key, breaking the still-running instance.
3. **Concurrent write hazards**: both processes can clobber the same `*.tmp` file and lose unrelated config entries.

## Goals
- Allow multiple Electron app processes to coexist without unsafe cross-routing.
- Enable external clients (Antigravity) to target a specific CodeNomad instance when possible.
- Keep UX minimal (no new UI).
- Ensure graceful cleanup on exit and best-effort cleanup after crashes.
- Work on macOS; assume other OS as well.

## Non-goals
- Implement a full broker/multiplexer service (out of scope for this PRD).
- Introduce new UI surfaces or complex instance selection UX.
- Change internal CodeNomad CLI per-instance MCP routing (already isolated).

## Constraints
- The external client behavior around multiple MCP server entries is unknown in this repo. It may:
  - require a single key (`ask-user`) only,
  - allow selecting among server keys, or
  - auto-load all configured servers and merge tools (potential collision risk).

Because of that, this PRD includes a **compatibility-first harness**.

## Proposed Design (Option 2)
### High-level approach
1. Introduce a **process-unique `instanceId`** for each Electron app process.
2. Write a **namespaced MCP server entry per instance**:
   - Example key formats (choose one):
     - `ask-user-codenomad-pid-<pid>-port-<port>`
     - `ask-user-codenomad-<instanceId>`
   - Keys should prefer conservative characters: `[a-z0-9-]`.
3. Preserve (optionally) the canonical alias `mcpServers['ask-user']` for compatibility.
4. Fix unsafe unregister and concurrent write behavior.

### Canonical alias policy
Because external clients may hardcode `ask-user`, we keep a canonical alias by default.

Supported modes:
- **lock** (default): first instance to register keeps canonical `ask-user` until it exits.
- **last**: last started instance overwrites canonical (legacy behavior, discouraged).
- **off**: never write canonical `ask-user` (only namespaced entries; only safe if the external client supports selection).

Configuration (no UI): environment variables read in Electron main process.
- `CODENOMAD_MCP_CANONICAL_MODE=lock|last|off` (default `lock`)
- `CODENOMAD_MCP_WRITE_NAMESPACED=0|1` (default `0` until external client behavior is confirmed)

## Detailed Requirements
### R1: Namespaced registration
- When enabled, each instance writes exactly one namespaced key mapping to its own port/token.
- The key must be deterministic for the running process and loggable.

### R2: Ownership-aware unregister
- On quit, an instance must remove only:
  - its own namespaced key (if written)
  - the canonical `ask-user` key **only if it still owns it**.

Ownership checks:
- The easiest check is: only delete canonical if the current `mcpServers['ask-user']` entry’s args match this process’s `--port` and `--token`.
- If a lock file is used, also confirm the lock belongs to the instance.

### R3: Safe concurrent writes
- Config writes must not use a shared temp file path across processes.
- Use unique temp paths, e.g. `mcp_config.json.tmp.<pid>.<random>`.

### R4: Crash tolerance / stale cleanup
- If namespaced entries are enabled, stale keys may accumulate after crashes.
- On startup, do best-effort pruning:
  - parse the configured `--port` from each CodeNomad namespaced entry
  - probe `http://127.0.0.1:<port>/health`
  - delete entries whose health check fails
- Pruning must be conservative and only affect keys matching CodeNomad’s chosen prefix.

### R5: macOS + cross-platform
- Use only Node filesystem primitives and avoid OS-specific APIs.
- Prefer lock acquisition via `fs.openSync(path, 'wx')` for broad support.

## Implementation Plan (repo touchpoints)
### 1) Add instanceId generation and pass-through
File: `packages/electron-app/electron/main/main.ts`
- Generate `instanceId` once per process (e.g., `crypto.randomUUID()` where available).
- Pass `instanceId`, `port`, and `token` into the registration API.

### 2) Evolve registration API
File: `packages/mcp-server/src/config/registration.ts`
Add/replace APIs:
- `writeMcpConfig({ instanceId, port, token, serverPath, canonicalMode, writeNamespaced })`
- `unregisterFromMcpConfig({ instanceId, port, token, canonicalMode, wroteNamespaced })`

Behavior:
- If `writeNamespaced` is enabled, write `mcpServers[ask-user-codenomad-...]`.
- If `canonicalMode` is `lock`:
  - acquire lock (e.g., `~/.gemini/antigravity/codenomad-ask-user.lock`)
  - only lock owner writes canonical `mcpServers['ask-user']`
- If `canonicalMode` is `last`: write canonical without lock (legacy)
- If `canonicalMode` is `off`: do not touch canonical

Unregister:
- Remove the namespaced entry for this instance.
- Remove canonical only if:
  - canonicalMode != `off`, and
  - current config matches this instance (args contain the same `--port` and `--token`), and
  - lock is owned by this instance (if lock mode).

### 3) Unique temp files for atomic writes
File: `packages/mcp-server/src/config/registration.ts`
- Replace `const tempPath = configPath + '.tmp'` with a unique filename.

## Compatibility Notes
- If the external client auto-loads all servers and merges tools, writing multiple servers that all expose `ask_user` may create tool name collisions.
- Therefore, default `CODENOMAD_MCP_WRITE_NAMESPACED=0` until client behavior is confirmed.

## Security Notes
- Current MCP server token generation exists, but the HTTP request handler does not obviously enforce Authorization in `packages/mcp-server/src/server.ts`.
- Regardless of multi-instance registration, if local security matters, enforce token checks as a follow-up.

## Test Plan
1. **Single instance**:
   - start CodeNomad
   - verify config contains canonical key (and optionally namespaced key)
   - quit CodeNomad
   - verify it only removes keys it owns
2. **Two instances**:
   - start instance A
   - start instance B
   - verify canonical key is stable under `lock` mode
   - quit instance B first → canonical should remain (owned by A)
   - quit instance A → canonical removed
3. **Crash simulation**:
   - start CodeNomad
   - force kill process (SIGKILL)
   - verify stale namespaced entries are pruned on next start (if pruning enabled)
4. **Concurrent write simulation**:
   - start two instances quickly
   - verify config file remains valid JSON and retains unrelated entries

## Open Questions
1. Does Antigravity support selecting among `mcpServers` keys, or does it only use `ask-user`?
2. If it loads all servers, how does it handle duplicate tool names (`ask_user`) across multiple servers?
3. Do we want to log the chosen namespaced key prominently in Electron logs to aid manual targeting?
