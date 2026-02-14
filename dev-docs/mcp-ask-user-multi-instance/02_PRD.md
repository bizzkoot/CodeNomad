# PRD: Multi-instance MCP `ask_user` with CodeNomad-local config

**Status:** Proposed

**Owner:** CodeNomad

**Last updated:** 2026-02-07

## Summary

CodeNomad currently writes its MCP `ask_user` server registration to Antigravity's global config file (`~/.gemini/antigravity/mcp_config.json`). This causes multi-instance conflicts when multiple Electron app processes run concurrently. This PRD proposes a simpler solution: write to a CodeNomad-specific location instead, eliminating external Antigravity integration and the associated multi-instance complexity.

## Background / Context

- Each CodeNomad Electron process starts an MCP server with a random port and token.
- Electron calls `writeMcpConfig(port, token, mcpServerPath)` to register the server.
- **Internal CodeNomad tool calls are already per-instance isolated** via `OPENCODE_CONFIG_CONTENT` and the per-instance `mcpPort`.
- The config file is only consumed by external Antigravity clients (not CodeNomad's own agents).
- Multi-instance conflicts only affect the external integration use case.

### Verified current behavior (repo sources)

- Global config path: `packages/mcp-server/src/config/registration.ts` → `~/.gemini/antigravity/mcp_config.json`
- Electron calls registration on startup and unregister on quit: `packages/electron-app/electron/main/main.ts`
- Current writer uses a fixed temp file (`mcp_config.json.tmp`), which is unsafe under concurrent writers.
- Current `unregisterFromMcpConfig()` deletes the entry unconditionally.

## Problem Statement

When two CodeNomad instances run concurrently:

1. **Last writer wins:** Both instances write to the same global `mcpServers['ask-user']` key.
2. **Unsafe deregistration:** Any instance exiting can delete the key, breaking the still-running instance.
3. **Concurrent write hazards:** Both processes use the same `*.tmp` file, risking config corruption.

## Root Cause Analysis

These problems exist because we're registering in a **shared global namespace** (Antigravity's config) for a feature (external integration) that is not core to CodeNomad's functionality.

CodeNomad's own agents use `OPENCODE_CONFIG_CONTENT` environment variables and are already per-instance isolated.

## Decision: Drop External Antigravity Integration

After analysis, external Antigravity integration:

- Is not a core requirement for CodeNomad's primary use case (internal agents)
- Introduces significant complexity (lock files, instance tracking, canonical aliases)
- Has unknown value (no documented external consumers)

**Solution:** Write MCP server config to a CodeNomad-specific location instead of Antigravity's global config.

## Goals

- Allow multiple Electron app processes to coexist safely.
- Eliminate multi-instance file contention.
- Simplify the codebase by removing external integration complexity.
- Maintain per-instance isolation for internal agents.
- Ensure graceful cleanup on exit.

## Non-goals

- Enable external Antigravity clients to discover CodeNomad's MCP server.
- Support selecting among multiple CodeNomad instances from external tools.
- Implement lock file management or canonical alias tracking.

## Proposed Design

### High-level approach

1. **Relocate config path:** Write to `~/.codenomad/mcp_config.json` instead of `~/.gemini/antigravity/mcp_config.json`.

2. **Per-instance config files (optional):** Each instance writes to its own file:
   ```
   ~/.codenomad/instances/<instanceId>/config.json
   ```

3. **Simple cleanup:** On exit, each instance removes its own config file.

4. **No external integration:** External Antigravity clients will not discover CodeNomad's MCP server (this is intentional).

### Architecture

```
~/.codenomad/
├── instances/
│   ├── abc-123/
│   │   └── config.json          ← Instance 1's MCP server config
│   └── def-456/
│       └── config.json          ← Instance 2's MCP server config
└── active                        (optional) Symlink to active instance
```

### Config file format (per-instance)

```json
{
  "instanceId": "abc-123",
  "pid": 12345,
  "port": 3000,
  "token": "random-token",
  "serverPath": "/path/to/server.js",
  "startedAt": "2026-02-07T10:30:00.000Z"
}
```

## Detailed Requirements

### R1: CodeNomad-local config path

- Change `getMcpConfigPath()` to return `~/.codenomad/mcp_config.json`.
- Or: Return `~/.codenomad/instances/<instanceId>/config.json` for per-instance files.

### R2: Instance identification

- Generate `instanceId` once per Electron process using `crypto.randomUUID()`.
- Store `instanceId` in the config file for identification.
- Log `instanceId` on startup for debugging.

### R3: Safe file writes

- Use unique temp file paths: `config.json.tmp.<pid>.<random>`.
- Atomic write: write to temp, then rename.

### R4: Instance-specific config files (recommended)

- Each instance writes to its own subdirectory: `~/.codenomad/instances/<instanceId>/config.json`.
- No contention between instances.
- Simple cleanup: delete own directory on exit.

### R5: Crash cleanup (best-effort)

- On startup, scan `~/.codenomad/instances/` for stale configs.
- Probe `http://127.0.0.1:<port>/health` for each instance.
- Delete configs where health check fails.
- Optionally: Check PID liveness (if stored in config).

### R6: Backward compatibility

- Existing `OPENCODE_CONFIG_CONTENT` mechanism continues to work.
- No changes needed for CodeNomad's internal agents.

## Implementation Plan

### 1) Update config path

File: `packages/mcp-server/src/config/registration.ts`

```typescript
export function getMcpConfigPath(instanceId?: string): string {
    const baseDir = path.join(os.homedir(), '.codenomad');

    if (instanceId) {
        // Per-instance config
        return path.join(baseDir, 'instances', instanceId, 'config.json');
    }

    // Shared config (fallback)
    return path.join(baseDir, 'mcp_config.json');
}
```

### 2) Add instanceId to registration

File: `packages/electron-app/electron/main/main.ts`

```typescript
import { randomUUID } from 'crypto';

// In app.whenReady()
const instanceId = randomUUID();

// Pass to registration
writeMcpConfig({
    instanceId,
    port,
    token,
    serverPath: mcpServerPath
});
```

### 3) Update registration API

File: `packages/mcp-server/src/config/registration.ts`

```typescript
export interface McpRegistrationConfig {
    instanceId: string;
    port: number;
    token: string;
    serverPath?: string;
}

export function writeMcpConfig(config: McpRegistrationConfig): void {
    const configPath = getMcpConfigPath(config.instanceId);

    // Write instance-specific config
    const instanceConfig = {
        instanceId: config.instanceId,
        pid: process.pid,
        port: config.port,
        token: config.token,
        serverPath: config.serverPath,
        startedAt: new Date().toISOString()
    };

    // Ensure directory exists
    const configDir = path.dirname(configPath);
    fs.mkdirSync(configDir, { recursive: true });

    // Atomic write
    const tempPath = `${configPath}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}`;
    fs.writeFileSync(tempPath, JSON.stringify(instanceConfig, null, 2));
    fs.renameSync(tempPath, configPath);

    console.log(`[MCP Config] Registered instance ${config.instanceId} on port ${config.port}`);
}
```

### 4) Update unregister

File: `packages/mcp-server/src/config/registration.ts`

```typescript
export function unregisterFromMcpConfig(instanceId: string): void {
    const configPath = getMcpConfigPath(instanceId);

    try {
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);

            // Try to remove empty parent directories
            const instancesDir = path.dirname(configPath);
            const remaining = fs.readdirSync(instancesDir);
            if (remaining.length === 0) {
                fs.rmSync(instancesDir, { recursive: true });
            }

            console.log(`[MCP Config] Unregistered instance ${instanceId}`);
        }
    } catch (error) {
        console.error('[MCP Config] Failed to unregister:', error);
    }
}
```

### 5) Add startup cleanup

File: `packages/mcp-server/src/config/registration.ts`

```typescript
export async function cleanupStaleInstances(): Promise<void> {
    const instancesDir = path.join(os.homedir(), '.codenomad', 'instances');

    if (!fs.existsSync(instancesDir)) {
        return;
    }

    const instanceDirs = fs.readdirSync(instancesDir);

    for (const instanceId of instanceDirs) {
        const configPath = path.join(instancesDir, instanceId, 'config.json');

        try {
            const content = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(content);

            // Check if process is still alive
            try {
                process.kill(config.pid, 0); // Signal 0 checks if process exists
                continue; // Process alive, skip
            } catch {
                // Process dead, check health endpoint
            }

            // Probe health endpoint
            const response = await fetch(`http://127.0.0.1:${config.port}/health`);
            if (response.ok) {
                continue; // Server responding, keep
            }

            // Stale: remove
            fs.rmSync(path.join(instancesDir, instanceId), { recursive: true });
            console.log(`[MCP Config] Cleaned up stale instance ${instanceId}`);
        } catch (error) {
            // Invalid config or other error, remove
            fs.rmSync(path.join(instancesDir, instanceId), { recursive: true });
        }
    }
}
```

### 6) Update Electron main

File: `packages/electron-app/electron/main/main.ts`

```typescript
import { cleanupStaleInstances } from "@codenomad/mcp-server/src/config/registration";

// In app.whenReady(), before starting MCP server
await cleanupStaleInstances();

// Store instanceId for later use
let mcpInstanceId: string;

// When starting MCP server
mcpInstanceId = randomUUID();
writeMcpConfig({
    instanceId: mcpInstanceId,
    port,
    token,
    serverPath: mcpServerPath
});

// In app.on("before-quit")
unregisterFromMcpConfig(mcpInstanceId);
```

## Compatibility Notes

- **External Antigravity clients:** Will no longer discover CodeNomad's MCP server. This is intentional.
- **CodeNomad internal agents:** No changes needed; they use `OPENCODE_CONFIG_CONTENT`.
- **Existing functionality:** Fully preserved for CodeNomad's primary use case.

## Security Notes

- Config files contain auth tokens and are written to user home directory.
- Consider file permissions: restrict to owner-only (`0o600`).
- Tokens are already randomly generated per instance.

## Test Plan

1. **Single instance:**
   - Start CodeNomad
   - Verify config exists at `~/.codenomad/instances/<id>/config.json`
   - Verify content includes instanceId, port, token
   - Quit CodeNomad
   - Verify config file is removed

2. **Two instances:**
   - Start instance A
   - Start instance B
   - Verify each has its own config file (different instanceIds)
   - Quit instance B
   - Verify instance A's config still exists
   - Quit instance A
   - Verify both config files removed

3. **Crash simulation:**
   - Start CodeNomad
   - Force kill process (SIGKILL)
   - Start CodeNomad again
   - Verify stale config from crashed instance is cleaned up

4. **Concurrent startup:**
   - Start two instances simultaneously
   - Verify both configs are written correctly
   - Verify no temp files remain
   - Verify configs are valid JSON

## Migration Path

For existing users:

1. Old config at `~/.gemini/antigravity/mcp_config.json` will be ignored.
2. No automatic migration needed (external integration is being dropped).
3. Optional: Add one-time cleanup of old config on first run.

## Open Questions

None identified. This approach is simpler than the original PRD and eliminates the multi-instance problem by design.

## Alternatives Considered

1. **Original PRD (01_PRD.md):** Complex namespaced registrations with lock files and canonical alias management. Rejected due to unnecessary complexity for a non-core feature.

2. **Symlink approach:** Use symlinks to manage active instance. Rejected as still requiring external integration.

3. **Status quo:** Continue writing to Antigravity config. Rejected due to multi-instance conflicts.
