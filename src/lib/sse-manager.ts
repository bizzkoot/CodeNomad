import { createSignal } from "solid-js"
import { 
  MessageUpdateEvent, 
  MessageRemovedEvent, 
  MessagePartUpdatedEvent, 
  MessagePartRemovedEvent 
} from "../types/message"
import type {
  EventSessionUpdated,
  EventSessionCompacted,
  EventSessionError,
  EventSessionIdle
} from "@opencode-ai/sdk"

interface SSEConnection {
  instanceId: string
  eventSource: EventSource
  reconnectAttempts: number
  status: "connecting" | "connected" | "disconnected" | "error"
}

interface TuiToastEvent {
  type: "tui.toast.show"
  properties: {
    title?: string
    message: string
    variant: "info" | "success" | "warning" | "error"
    duration?: number
  }
}

type SSEEvent = 
  | MessageUpdateEvent
  | MessageRemovedEvent
  | MessagePartUpdatedEvent
  | MessagePartRemovedEvent
  | EventSessionUpdated
  | EventSessionCompacted
  | EventSessionError
  | EventSessionIdle
  | TuiToastEvent
  | { type: string; properties?: Record<string, unknown> } // Fallback for unknown event types

const [connectionStatus, setConnectionStatus] = createSignal<
  Map<string, "connecting" | "connected" | "disconnected" | "error">
>(new Map())

class SSEManager {
  private connections = new Map<string, SSEConnection>()
  private maxReconnectAttempts = 5
  private baseReconnectDelay = 1000

  connect(instanceId: string, port: number): void {
    if (this.connections.has(instanceId)) {
      this.disconnect(instanceId)
    }

    const url = `http://localhost:${port}/event`
    const eventSource = new EventSource(url)

    const connection: SSEConnection = {
      instanceId,
      eventSource,
      reconnectAttempts: 0,
      status: "connecting",
    }

    this.connections.set(instanceId, connection)
    this.updateConnectionStatus(instanceId, "connecting")

    eventSource.onopen = () => {
      connection.status = "connected"
      connection.reconnectAttempts = 0
      this.updateConnectionStatus(instanceId, "connected")
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
      this.updateConnectionStatus(instanceId, "error")
      console.error(`[SSE] Connection error for instance ${instanceId}`)
      this.handleReconnect(instanceId, port)
    }
  }

  disconnect(instanceId: string): void {
    const connection = this.connections.get(instanceId)
    if (connection) {
      connection.eventSource.close()
      this.connections.delete(instanceId)
      this.updateConnectionStatus(instanceId, "disconnected")
      console.log(`[SSE] Disconnected from instance ${instanceId}`)
    }
  }

  private handleEvent(instanceId: string, event: SSEEvent): void {
    console.log("[SSE] Received event:", event.type, event)

    switch (event.type) {
      case "message.updated":
        this.onMessageUpdate?.(instanceId, event as MessageUpdateEvent)
        break
      case "message.part.updated":
        this.onMessagePartUpdated?.(instanceId, event as MessagePartUpdatedEvent)
        break
      case "message.removed":
        this.onMessageRemoved?.(instanceId, event as MessageRemovedEvent)
        break
      case "message.part.removed":
        this.onMessagePartRemoved?.(instanceId, event as MessagePartRemovedEvent)
        break
      case "session.updated":
        this.onSessionUpdate?.(instanceId, event as EventSessionUpdated)
        break
      case "session.compacted":
        this.onSessionCompacted?.(instanceId, event as EventSessionCompacted)
        break
      case "session.error":
        this.onSessionError?.(instanceId, event as EventSessionError)
        break
      case "tui.toast.show":
        this.onTuiToast?.(instanceId, event as TuiToastEvent)
        break
      case "session.idle":
        this.onSessionIdle?.(instanceId, event as EventSessionIdle)
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
      this.updateConnectionStatus(instanceId, "disconnected")
      return
    }

    const delay = this.baseReconnectDelay * Math.pow(2, connection.reconnectAttempts)
    connection.reconnectAttempts++

    console.log(`[SSE] Reconnecting to ${instanceId} in ${delay}ms (attempt ${connection.reconnectAttempts})`)

    setTimeout(() => {
      this.connect(instanceId, port)
    }, delay)
  }

  private updateConnectionStatus(instanceId: string, status: SSEConnection["status"]): void {
    setConnectionStatus((prev) => {
      const next = new Map(prev)
      next.set(instanceId, status)
      return next
    })
  }

  onMessageUpdate?: (instanceId: string, event: MessageUpdateEvent) => void
  onMessageRemoved?: (instanceId: string, event: MessageRemovedEvent) => void
  onMessagePartUpdated?: (instanceId: string, event: MessagePartUpdatedEvent) => void
  onMessagePartRemoved?: (instanceId: string, event: MessagePartRemovedEvent) => void
  onSessionUpdate?: (instanceId: string, event: EventSessionUpdated) => void
  onSessionCompacted?: (instanceId: string, event: EventSessionCompacted) => void
  onSessionError?: (instanceId: string, event: EventSessionError) => void
  onTuiToast?: (instanceId: string, event: TuiToastEvent) => void
  onSessionIdle?: (instanceId: string, event: EventSessionIdle) => void

  getStatus(instanceId: string): "connecting" | "connected" | "disconnected" | "error" | null {
    return connectionStatus().get(instanceId) ?? null
  }

  getStatuses() {
    return connectionStatus()
  }
}

export const sseManager = new SSEManager()
