# Task 008: SSE Integration - Real-time Message Streaming

> Note: References to `message-stream.tsx` here are legacy; the current UI uses `message-stream-v2.tsx` with the normalized message store.

## Status: TODO

## Objective

Implement Server-Sent Events (SSE) integration to enable real-time message streaming from OpenCode servers. Each instance will maintain its own EventSource connection to receive live updates for sessions and messages.

## Prerequisites

- Task 006 (Instance/Session tabs) complete
- Task 007 (Message display) complete
- SDK client configured per instance
- Understanding of EventSource API

## Context

The OpenCode server emits events via SSE at the `/events` endpoint. These events include:

- Message updates (streaming content)
- Session updates (new sessions, title changes)
- Tool execution status updates
- Server status changes

We need to:

1. Create an SSE manager to handle connections
2. Connect one EventSource per instance
3. Route events to the correct instance/session
4. Update reactive state to trigger UI updates
5. Implement reconnection logic for dropped connections

## Implementation Steps

### Step 1: Create SSE Manager Module

Create `src/lib/sse-manager.ts`:

```typescript
import { createSignal } from "solid-js"

interface SSEConnection {
  instanceId: string
  eventSource: EventSource
  reconnectAttempts: number
  status: "connecting" | "connected" | "disconnected" | "error"
}

interface MessageUpdateEvent {
  type: "message_updated"
  sessionId: string
  messageId: string
  parts: any[]
  status: string
}

interface SessionUpdateEvent {
  type: "session_updated"
  session: any
}

class SSEManager {
  private connections = new Map<string, SSEConnection>()
  private maxReconnectAttempts = 5
  private baseReconnectDelay = 1000

  connect(instanceId: string, port: number): void {
    if (this.connections.has(instanceId)) {
      this.disconnect(instanceId)
    }

    const url = `http://localhost:${port}/events`
    const eventSource = new EventSource(url)

    const connection: SSEConnection = {
      instanceId,
      eventSource,
      reconnectAttempts: 0,
      status: "connecting",
    }

    this.connections.set(instanceId, connection)

    eventSource.onopen = () => {
      connection.status = "connected"
      connection.reconnectAttempts = 0
      console.log(`[SSE] Connected to instance ${instanceId}`)
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.handleEvent(instanceId, data)
      } catch (error) {
        console.error("[SSE] Failed to parse event:", error)
      }
    }

    eventSource.onerror = () => {
      connection.status = "error"
      console.error(`[SSE] Connection error for instance ${instanceId}`)
      this.handleReconnect(instanceId, port)
    }
  }

  disconnect(instanceId: string): void {
    const connection = this.connections.get(instanceId)
    if (connection) {
      connection.eventSource.close()
      this.connections.delete(instanceId)
      console.log(`[SSE] Disconnected from instance ${instanceId}`)
    }
  }

  private handleEvent(instanceId: string, event: any): void {
    switch (event.type) {
      case "message_updated":
        this.onMessageUpdate?.(instanceId, event as MessageUpdateEvent)
        break
      case "session_updated":
        this.onSessionUpdate?.(instanceId, event as SessionUpdateEvent)
        break
      default:
        console.warn("[SSE] Unknown event type:", event.type)
    }
  }

  private handleReconnect(instanceId: string, port: number): void {
    const connection = this.connections.get(instanceId)
    if (!connection) return

    if (connection.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[SSE] Max reconnection attempts reached for ${instanceId}`)
      connection.status = "disconnected"
      return
    }

    const delay = this.baseReconnectDelay * Math.pow(2, connection.reconnectAttempts)
    connection.reconnectAttempts++

    console.log(`[SSE] Reconnecting to ${instanceId} in ${delay}ms (attempt ${connection.reconnectAttempts})`)

    setTimeout(() => {
      this.connect(instanceId, port)
    }, delay)
  }

  onMessageUpdate?: (instanceId: string, event: MessageUpdateEvent) => void
  onSessionUpdate?: (instanceId: string, event: SessionUpdateEvent) => void

  getStatus(instanceId: string): SSEConnection["status"] | null {
    return this.connections.get(instanceId)?.status ?? null
  }
}

export const sseManager = new SSEManager()
```

### Step 2: Integrate SSE Manager with Instance Store

Update `src/stores/instances.ts` to use SSE manager:

```typescript
import { sseManager } from "../lib/sse-manager"

// In createInstance function, after SDK client is created:
async function createInstance(folder: string) {
  // ... existing code to spawn server and create SDK client ...

  // Connect SSE
  sseManager.connect(instance.id, port)

  // Set up event handlers
  sseManager.onMessageUpdate = (instanceId, event) => {
    handleMessageUpdate(instanceId, event)
  }

  sseManager.onSessionUpdate = (instanceId, event) => {
    handleSessionUpdate(instanceId, event)
  }
}

// In removeInstance function:
async function removeInstance(id: string) {
  // Disconnect SSE before removing
  sseManager.disconnect(id)

  // ... existing cleanup code ...
}
```

### Step 3: Handle Message Update Events

Create message update handler in instance store:

```typescript
function handleMessageUpdate(instanceId: string, event: MessageUpdateEvent) {
  const instance = instances.get(instanceId)
  if (!instance) return

  const session = instance.sessions.get(event.sessionId)
  if (!session) return

  // Find or create message
  let message = session.messages.find((m) => m.id === event.messageId)

  if (!message) {
    // New message - add it
    message = {
      id: event.messageId,
      sessionId: event.sessionId,
      type: "assistant", // Determine from event
      parts: event.parts,
      timestamp: Date.now(),
      status: event.status,
    }
    session.messages.push(message)
  } else {
    // Update existing message
    message.parts = event.parts
    message.status = event.status
  }

  // Trigger reactivity - update the map reference
  instances.set(instanceId, { ...instance })
}
```

### Step 4: Handle Session Update Events

Create session update handler:

```typescript
function handleSessionUpdate(instanceId: string, event: SessionUpdateEvent) {
  const instance = instances.get(instanceId)
  if (!instance) return

  const existingSession = instance.sessions.get(event.session.id)

  if (!existingSession) {
    // New session - add it
    const newSession = {
      id: event.session.id,
      instanceId,
      title: event.session.title || "Untitled",
      parentId: event.session.parentId,
      agent: event.session.agent,
      model: event.session.model,
      messages: [],
      status: "idle",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    instance.sessions.set(event.session.id, newSession)

    // Auto-create tab for child sessions
    if (event.session.parentId) {
      console.log(`[SSE] New child session created: ${event.session.id}`)
      // Optionally auto-switch to new session
      // instance.activeSessionId = event.session.id
    }
  } else {
    // Update existing session
    existingSession.title = event.session.title || existingSession.title
    existingSession.agent = event.session.agent || existingSession.agent
    existingSession.model = event.session.model || existingSession.model
    existingSession.updatedAt = Date.now()
  }

  // Trigger reactivity
  instances.set(instanceId, { ...instance })
}
```

### Step 5: Add Connection Status Indicator

Update `src/components/message-stream.tsx` to show connection status:

```typescript
import { sseManager } from "../lib/sse-manager"

function MessageStream(props) {
  const connectionStatus = () => sseManager.getStatus(props.instanceId)

  return (
    <div class="flex flex-col h-full">
      {/* Connection status indicator */}
      <div class="flex items-center justify-end px-4 py-2 text-xs text-gray-500">
        {connectionStatus() === "connected" && (
          <span class="flex items-center gap-1">
            <div class="w-2 h-2 bg-green-500 rounded-full" />
            Connected
          </span>
        )}
        {connectionStatus() === "connecting" && (
          <span class="flex items-center gap-1">
            <div class="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            Connecting...
          </span>
        )}
        {connectionStatus() === "error" && (
          <span class="flex items-center gap-1">
            <div class="w-2 h-2 bg-red-500 rounded-full" />
            Disconnected
          </span>
        )}
      </div>

      {/* Existing message list */}
      {/* ... */}
    </div>
  )
}
```

### Step 6: Test SSE Connection

Create a test utility to verify SSE is working:

```typescript
// In browser console or test file:
async function testSSE() {
  // Manually trigger a message
  const response = await fetch("http://localhost:4096/session/SESSION_ID/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "Hello, world!",
      attachments: [],
    }),
  })

  // Check console for SSE events
  // Should see message_updated events arriving
}
```

### Step 7: Handle Edge Cases

Add error handling for:

```typescript
// Connection drops during message streaming
// - Reconnect logic should handle this automatically
// - Messages should resume from last known state

// Multiple instances with different ports
// - Each instance has its own EventSource
// - Events routed correctly via instanceId

// Instance removed while connected
// - EventSource closed before instance cleanup
// - No memory leaks

// Page visibility changes (browser tab inactive)
// - EventSource may pause, reconnect on focus
// - Consider using Page Visibility API to manage connections
```

## Testing Checklist

### Manual Testing

- [ ] Open instance, verify SSE connection established
- [ ] Send message, verify streaming events arrive
- [ ] Check browser DevTools Network tab for SSE connection
- [ ] Verify connection status indicator shows "Connected"
- [ ] Kill server process, verify reconnection attempts
- [ ] Restart server, verify successful reconnection
- [ ] Open multiple instances, verify independent connections
- [ ] Switch between instances, verify events route correctly
- [ ] Close instance tab, verify EventSource closed cleanly

### Testing Message Streaming

- [ ] Send message, watch events in console
- [ ] Verify message parts update in real-time
- [ ] Check assistant response streams character by character
- [ ] Verify tool calls appear as they execute
- [ ] Confirm message status updates (streaming → complete)

### Testing Child Sessions

- [ ] Trigger action that creates child session
- [ ] Verify session_updated event received
- [ ] Confirm new session tab appears
- [ ] Check parentId correctly set

### Testing Reconnection

- [ ] Disconnect network, verify reconnection attempts
- [ ] Reconnect network, verify successful reconnection
- [ ] Verify exponential backoff delays
- [ ] Confirm max attempts limit works

## Acceptance Criteria

- [ ] SSE connection established when instance created
- [ ] Message updates arrive in real-time
- [ ] Session updates handled correctly
- [ ] Child sessions auto-create tabs
- [ ] Connection status visible in UI
- [ ] Reconnection logic works with exponential backoff
- [ ] Multiple instances have independent connections
- [ ] EventSource closed when instance removed
- [ ] No console errors during normal operation
- [ ] Events route to correct instance/session

## Performance Considerations

**Note: Per MVP principles, don't over-optimize**

- Simple event handling - no batching needed
- Direct state updates trigger reactivity
- Reconnection uses exponential backoff
- Only optimize if lag occurs in testing

## Future Enhancements (Post-MVP)

- Event batching for high-frequency updates
- Delta updates instead of full message parts
- Offline queue for events missed during disconnect
- Page Visibility API integration
- Event compression for large payloads

## References

- [Technical Implementation - SSE Event Handling](../docs/technical-implementation.md#sse-event-handling)
- [Architecture - Communication Layer](../docs/architecture.md#communication-layer)
- [MDN - EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)

## Estimated Time

3-4 hours

## Notes

- Keep reconnection logic simple for MVP
- Log all SSE events to console for debugging
- Test with long-running streaming responses
- Verify memory usage doesn't grow over time
- Consider adding SSE event debugging panel (optional)
