# Task 004: SDK Client Integration & Session Management

## Goal

Integrate the OpenCode SDK to communicate with running servers, fetch session lists, and manage session lifecycle.

## Prerequisites

- Task 003 completed (server spawning works)
- OpenCode SDK package available
- Understanding of HTTP/REST APIs
- Understanding of SolidJS reactivity

## Acceptance Criteria

- [ ] SDK client created per instance
- [ ] Can fetch session list from server
- [ ] Can create new session
- [ ] Can get session details
- [ ] Can delete session
- [ ] Client lifecycle tied to instance lifecycle
- [ ] Error handling for network failures
- [ ] Proper TypeScript types throughout

## Steps

### 1. Create SDK Manager Module

**src/lib/sdk-manager.ts:**

**Purpose:**

- Manage SDK client instances
- One client per server (per port)
- Create, retrieve, destroy clients

**Interface:**

```typescript
interface SDKManager {
  createClient(port: number): OpenCodeClient
  getClient(port: number): OpenCodeClient | null
  destroyClient(port: number): void
  destroyAll(): void
}
```

**Implementation details:**

- Store clients in Map<port, client>
- Create client with base URL: `http://localhost:${port}`
- Handle client creation errors
- Clean up on destroy

### 2. Update Instance Store

**src/stores/instances.ts additions:**

**Add client to Instance:**

```typescript
interface Instance {
  // ... existing fields
  client: OpenCodeClient | null
}
```

**Update createInstance:**

- After server spawns successfully
- Create SDK client for that port
- Store in instance.client
- Handle client creation errors

**Update removeInstance:**

- Destroy SDK client before removing
- Call sdkManager.destroyClient(port)

### 3. Create Session Store

**src/stores/sessions.ts:**

**State structure:**

```typescript
interface Session {
  id: string
  instanceId: string
  title: string
  parentId: string | null
  agent: string
  model: {
    providerId: string
    modelId: string
  }
  time: {
    created: number
    updated: number
  }
}

interface SessionStore {
  // Sessions grouped by instance
  sessions: Map<string, Map<string, Session>>

  // Active session per instance
  activeSessionId: Map<string, string>
}
```

**Core actions:**

```typescript
// Fetch all sessions for an instance
async function fetchSessions(instanceId: string): Promise<void>

// Create new session
async function createSession(instanceId: string, agent: string): Promise<Session>

// Delete session
async function deleteSession(instanceId: string, sessionId: string): Promise<void>

// Set active session
function setActiveSession(instanceId: string, sessionId: string): void

// Get active session
function getActiveSession(instanceId: string): Session | null

// Get all sessions for instance
function getSessions(instanceId: string): Session[]
```

### 4. Implement Session Fetching

**fetchSessions implementation:**

```typescript
async function fetchSessions(instanceId: string) {
  const instance = instances.get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  try {
    const response = await instance.client.session.list()

    // Convert API response to Session objects
    const sessionMap = new Map<string, Session>()

    for (const apiSession of response.data) {
      sessionMap.set(apiSession.id, {
        id: apiSession.id,
        instanceId,
        title: apiSession.title || "Untitled",
        parentId: apiSession.parentId || null,
        agent: "", // Will be populated from messages
        model: { providerId: "", modelId: "" },
        time: {
          created: apiSession.time.created,
          updated: apiSession.time.updated,
        },
      })
    }

    sessions.set(instanceId, sessionMap)
  } catch (error) {
    console.error("Failed to fetch sessions:", error)
    throw error
  }
}
```

### 5. Implement Session Creation

**createSession implementation:**

```typescript
async function createSession(instanceId: string, agent: string): Promise<Session> {
  const instance = instances.get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  try {
    const response = await instance.client.session.create({
      // OpenCode API might need specific params
    })

    const session: Session = {
      id: response.data.id,
      instanceId,
      title: "New Session",
      parentId: null,
      agent,
      model: { providerId: "", modelId: "" },
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }

    // Add to store
    const instanceSessions = sessions.get(instanceId) || new Map()
    instanceSessions.set(session.id, session)
    sessions.set(instanceId, instanceSessions)

    return session
  } catch (error) {
    console.error("Failed to create session:", error)
    throw error
  }
}
```

### 6. Implement Session Deletion

**deleteSession implementation:**

```typescript
async function deleteSession(instanceId: string, sessionId: string): Promise<void> {
  const instance = instances.get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  try {
    await instance.client.session.delete({ path: { id: sessionId } })

    // Remove from store
    const instanceSessions = sessions.get(instanceId)
    if (instanceSessions) {
      instanceSessions.delete(sessionId)
    }

    // Clear active if it was active
    if (activeSessionId.get(instanceId) === sessionId) {
      activeSessionId.delete(instanceId)
    }
  } catch (error) {
    console.error("Failed to delete session:", error)
    throw error
  }
}
```

### 7. Implement Agent & Model Fetching

**Fetch available agents:**

```typescript
interface Agent {
  name: string
  description: string
  mode: string
}

async function fetchAgents(instanceId: string): Promise<Agent[]> {
  const instance = instances.get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  try {
    const response = await instance.client.agent.list()
    return response.data.filter((agent) => agent.mode !== "subagent")
  } catch (error) {
    console.error("Failed to fetch agents:", error)
    return []
  }
}
```

**Fetch available models:**

```typescript
interface Provider {
  id: string
  name: string
  models: Model[]
}

interface Model {
  id: string
  name: string
  providerId: string
}

async function fetchProviders(instanceId: string): Promise<Provider[]> {
  const instance = instances.get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  try {
    const response = await instance.client.config.providers()
    return response.data.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: Object.entries(provider.models).map(([id, model]) => ({
        id,
        name: model.name,
        providerId: provider.id,
      })),
    }))
  } catch (error) {
    console.error("Failed to fetch providers:", error)
    return []
  }
}
```

### 8. Add Error Handling

**Network error handling:**

```typescript
function handleSDKError(error: any): string {
  if (error.code === "ECONNREFUSED") {
    return "Cannot connect to server. Is it running?"
  }
  if (error.code === "ETIMEDOUT") {
    return "Request timed out. Please try again."
  }
  if (error.response?.status === 404) {
    return "Resource not found"
  }
  if (error.response?.status === 500) {
    return "Server error. Check logs."
  }
  return error.message || "Unknown error occurred"
}
```

**Retry logic (for transient failures):**

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
  let lastError

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}
```

### 9. Add Loading States

**Track loading states:**

```typescript
interface LoadingState {
  fetchingSessions: Map<string, boolean>
  creatingSession: Map<string, boolean>
  deletingSession: Map<string, Set<string>>
}

const loading: LoadingState = {
  fetchingSessions: new Map(),
  creatingSession: new Map(),
  deletingSession: new Map(),
}
```

**Use in actions:**

```typescript
async function fetchSessions(instanceId: string) {
  loading.fetchingSessions.set(instanceId, true)
  try {
    // ... fetch logic
  } finally {
    loading.fetchingSessions.set(instanceId, false)
  }
}
```

### 10. Wire Up to Instance Creation

**src/stores/instances.ts updates:**

**After server ready:**

```typescript
async function createInstance(folder: string) {
  // ... spawn server ...

  // Create SDK client
  const client = sdkManager.createClient(port)

  // Update instance
  instances.set(id, {
    ...instances.get(id)!,
    port,
    pid,
    client,
    status: "ready",
  })

  // Fetch initial data
  try {
    await fetchSessions(id)
    await fetchAgents(id)
    await fetchProviders(id)
  } catch (error) {
    console.error("Failed to fetch initial data:", error)
    // Don't fail instance creation, just log
  }

  return id
}
```

### 11. Add Type Safety

**src/types/session.ts:**

```typescript
export interface Session {
  id: string
  instanceId: string
  title: string
  parentId: string | null
  agent: string
  model: {
    providerId: string
    modelId: string
  }
  time: {
    created: number
    updated: number
  }
}

export interface Agent {
  name: string
  description: string
  mode: string
}

export interface Provider {
  id: string
  name: string
  models: Model[]
}

export interface Model {
  id: string
  name: string
  providerId: string
}
```

## Testing Checklist

**Manual Tests:**

1. Create instance → Sessions fetched automatically
2. Console shows session list
3. Create new session → Appears in list
4. Delete session → Removed from list
5. Network fails → Error message shown
6. Server not running → Graceful error

**Error Cases:**

- Server not responding (ECONNREFUSED)
- Request timeout
- 404 on session endpoint
- 500 server error
- Invalid session ID

**Edge Cases:**

- No sessions exist (empty list)
- Many sessions (100+)
- Session with very long title
- Parent-child session relationships

## Dependencies

- **Blocks:** Task 005 (needs session data)
- **Blocked by:** Task 003 (needs running server)

## Estimated Time

3-4 hours

## Notes

- Keep SDK calls isolated in store actions
- All SDK calls should have error handling
- Consider caching to reduce API calls
- Log all API calls for debugging
- Handle slow connections gracefully
