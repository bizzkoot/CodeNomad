# Task 003: OpenCode Server Process Management

## Goal

Implement the ability to spawn, manage, and kill OpenCode server processes from the Electron main process.

## Prerequisites

- Task 001 completed (project setup)
- Task 002 completed (folder selection working)
- OpenCode CLI installed and in PATH
- Understanding of Node.js child_process API

## Acceptance Criteria

- [ ] Can spawn `opencode serve` for a folder
- [ ] Parses stdout to extract port number
- [ ] Returns port and PID to renderer
- [ ] Handles spawn errors gracefully
- [ ] Can kill process on command
- [ ] Captures and forwards stdout/stderr
- [ ] Timeout protection (10 seconds)
- [ ] Process cleanup on app quit

## Steps

### 1. Create Process Manager Module

**electron/main/process-manager.ts:**

**Exports:**

```typescript
interface ProcessInfo {
  pid: number
  port: number
}

interface ProcessManager {
  spawn(folder: string): Promise<ProcessInfo>
  kill(pid: number): Promise<void>
  getStatus(pid: number): "running" | "stopped" | "unknown"
  getAllProcesses(): Map<number, ProcessMeta>
}

interface ProcessMeta {
  pid: number
  port: number
  folder: string
  startTime: number
  childProcess: ChildProcess
}
```

### 2. Implement Spawn Logic

**spawn(folder: string):**

**Pre-flight checks:**

- Verify `opencode` binary exists in PATH
  - Use `which opencode` or `where opencode`
  - If not found, reject with helpful error
- Verify folder exists and is directory
  - Use `fs.stat()` to check
  - If invalid, reject with error
- Verify folder is readable
  - Check permissions
  - If denied, reject with error

**Process spawning:**

- Use `child_process.spawn()`
- Command: `opencode`
- Args: `['serve', '--port', '0']`
  - Port 0 = random available port
- Options:
  - `cwd`: The selected folder
  - `stdio`: `['ignore', 'pipe', 'pipe']`
    - stdin: ignore
    - stdout: pipe (we'll read it)
    - stderr: pipe (for errors)
  - `env`: Inherit process.env
  - `shell`: false (security)

**Port extraction:**

- Listen to stdout data events
- Buffer output line by line
- Regex match: `/Server listening on port (\d+)/` or similar
- Extract port number when found
- Store process metadata
- Resolve promise with { pid, port }

**Timeout handling:**

- Set 10 second timeout
- If port not found within timeout:
  - Kill the process
  - Reject promise with timeout error
- Clear timeout once port found

**Error handling:**

- Listen to process 'error' event
  - Common: ENOENT (binary not found)
  - Reject promise immediately
- Listen to process 'exit' event
  - If exits before port found:
    - Read stderr buffer
    - Reject with exit code and stderr

### 3. Implement Kill Logic

**kill(pid: number):**

**Find process:**

- Look up pid in internal Map
- If not found, reject with "Process not found"

**Graceful shutdown:**

- Send SIGTERM signal first
- Wait 2 seconds
- If still running, send SIGKILL
- Remove from internal Map
- Resolve when process exits

**Cleanup:**

- Close stdio streams
- Remove all event listeners
- Free resources

### 4. Implement Status Check

**getStatus(pid: number):**

**Check if running:**

- On Unix: Use `process.kill(pid, 0)`
  - Returns true if running
  - Throws if not running
- On Windows: Use tasklist or similar
- Return 'running', 'stopped', or 'unknown'

### 5. Add Process Tracking

**Internal state:**

```typescript
const processes = new Map<number, ProcessMeta>()
```

**Track all spawned processes:**

- Add on successful spawn
- Remove on kill or exit
- Use for cleanup on app quit

### 6. Implement Auto-cleanup

**On app quit:**

- Listen to app 'before-quit' event
- Kill all tracked processes
- Wait for all to exit (with timeout)
- Prevent quit until cleanup done

**On process crash:**

- Listen to process 'exit' event
- If unexpected exit:
  - Log error
  - Notify renderer via IPC
  - Remove from tracking

### 7. Add Logging

**Log output forwarding:**

- Listen to stdout/stderr
- Parse into lines
- Send to renderer via IPC events
  - Event: 'instance:log'
  - Payload: { pid, level: 'info' | 'error', message }

**Log important events:**

- Process spawned
- Port discovered
- Process exited
- Errors occurred

### 8. Add IPC Handlers

**electron/main/ipc.ts (new file):**

**Register handlers:**

```typescript
ipcMain.handle("process:spawn", async (event, folder: string) => {
  return await processManager.spawn(folder)
})

ipcMain.handle("process:kill", async (event, pid: number) => {
  return await processManager.kill(pid)
})

ipcMain.handle("process:status", async (event, pid: number) => {
  return processManager.getStatus(pid)
})
```

**Send events:**

```typescript
// When process exits unexpectedly
webContents.send("process:exited", { pid, code, signal })

// When log output received
webContents.send("process:log", { pid, level, message })
```

### 9. Update Preload Script

**electron/preload/index.ts additions:**

**Expose methods:**

```typescript
electronAPI: {
  spawnServer: (folder: string) => Promise<{ pid: number, port: number }>
  killServer: (pid: number) => Promise<void>
  getServerStatus: (pid: number) => Promise<string>

  onServerExited: (callback: (data: any) => void) => void
  onServerLog: (callback: (data: any) => void) => void
}
```

**Type definitions:**

```typescript
interface ProcessInfo {
  pid: number
  port: number
}

interface ElectronAPI {
  // ... previous methods
  spawnServer: (folder: string) => Promise<ProcessInfo>
  killServer: (pid: number) => Promise<void>
  getServerStatus: (pid: number) => Promise<"running" | "stopped" | "unknown">
  onServerExited: (callback: (data: { pid: number; code: number }) => void) => void
  onServerLog: (callback: (data: { pid: number; level: string; message: string }) => void) => void
}
```

### 10. Create Instance Store

**src/stores/instances.ts:**

**State:**

```typescript
interface Instance {
  id: string // UUID
  folder: string
  port: number
  pid: number
  status: "starting" | "ready" | "error" | "stopped"
  error?: string
}

interface InstanceStore {
  instances: Map<string, Instance>
  activeInstanceId: string | null
}
```

**Actions:**

```typescript
async function createInstance(folder: string) {
  const id = generateId()

  // Add with 'starting' status
  instances.set(id, {
    id,
    folder,
    port: 0,
    pid: 0,
    status: "starting",
  })

  try {
    // Spawn server
    const { pid, port } = await window.electronAPI.spawnServer(folder)

    // Update with port and pid
    instances.set(id, {
      ...instances.get(id)!,
      port,
      pid,
      status: "ready",
    })

    return id
  } catch (error) {
    // Update with error
    instances.set(id, {
      ...instances.get(id)!,
      status: "error",
      error: error.message,
    })
    throw error
  }
}

async function removeInstance(id: string) {
  const instance = instances.get(id)
  if (!instance) return

  // Kill server
  if (instance.pid) {
    await window.electronAPI.killServer(instance.pid)
  }

  // Remove from store
  instances.delete(id)

  // If was active, clear active
  if (activeInstanceId === id) {
    activeInstanceId = null
  }
}
```

### 11. Wire Up Folder Selection

**src/App.tsx updates:**

**After folder selected:**

```typescript
async function handleSelectFolder() {
  const folder = await window.electronAPI.selectFolder()
  if (!folder) return

  try {
    const instanceId = await createInstance(folder)
    setActiveInstance(instanceId)

    // Hide empty state, show instance UI
    setHasInstances(true)
  } catch (error) {
    console.error("Failed to create instance:", error)
    // TODO: Show error toast
  }
}
```

**Listen for process exit:**

```typescript
onMount(() => {
  window.electronAPI.onServerExited(({ pid }) => {
    // Find instance by PID
    const instance = Array.from(instances.values()).find((i) => i.pid === pid)

    if (instance) {
      // Update status
      instances.set(instance.id, {
        ...instance,
        status: "stopped",
      })

      // TODO: Show notification (Task 010)
    }
  })
})
```

## Testing Checklist

**Manual Tests:**

1. Select folder → Server spawns
2. Console shows "Spawned PID: XXX, Port: YYYY"
3. Check `ps aux | grep opencode` → Process running
4. Quit app → Process killed
5. Select invalid folder → Error shown
6. Select without opencode installed → Helpful error
7. Spawn multiple instances → All tracked
8. Kill one instance → Others continue running

**Error Cases:**

- opencode not in PATH
- Permission denied on folder
- Port already in use (should not happen with port 0)
- Server crashes immediately
- Timeout (server takes >10s to start)

**Edge Cases:**

- Very long folder path
- Folder with spaces in name
- Folder on network drive (slow to spawn)
- Multiple instances same folder (different ports)

## Dependencies

- **Blocks:** Task 004 (needs running server to connect SDK)
- **Blocked by:** Task 001, Task 002

## Estimated Time

4-5 hours

## Notes

- Security: Never use shell execution with user input
- Cross-platform: Test on macOS, Windows, Linux
- Error messages must be actionable
- Log everything for debugging
- Consider rate limiting (max 10 instances?)
- Memory: Track process memory usage (future enhancement)
