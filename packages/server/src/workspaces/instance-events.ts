import { Agent, fetch } from "undici"
import { Agent as UndiciAgent } from "undici"
import { EventBus } from "../events/bus"
import { Logger } from "../logger"
import { WorkspaceManager } from "./manager"
import { InstanceStreamEvent, InstanceStreamStatus } from "../api-types"

const INSTANCE_HOST = "127.0.0.1"
const STREAM_AGENT = new UndiciAgent({ bodyTimeout: 0, headersTimeout: 0 })
const RECONNECT_DELAY_MS = 1000

interface InstanceEventBridgeOptions {
  workspaceManager: WorkspaceManager
  eventBus: EventBus
  logger: Logger
}

interface ActiveStream {
  controller: AbortController
  task: Promise<void>
}

interface SessionCacheEntry {
  parentID: string | null
  parentIdKnown: boolean
  verified: boolean
}

export class InstanceEventBridge {
  private readonly streams = new Map<string, ActiveStream>()
  private readonly sessionCache = new Map<string, Map<string, SessionCacheEntry>>()
  private readonly sessionFetches = new Map<string, Promise<any | null>>()
  private readonly eventQueues = new Map<string, Promise<void>>()

  constructor(private readonly options: InstanceEventBridgeOptions) {
    const bus = this.options.eventBus
    bus.on("workspace.started", (event) => this.startStream(event.workspace.id))
    bus.on("workspace.stopped", (event) => this.stopStream(event.workspaceId, "workspace stopped"))
    bus.on("workspace.error", (event) => this.stopStream(event.workspace.id, "workspace error"))
  }

  shutdown() {
    for (const [id, active] of this.streams) {
      active.controller.abort()
      this.publishStatus(id, "disconnected")
    }
    this.streams.clear()
    // Clean up session cache and event queues to prevent memory leaks
    this.sessionCache.clear()
    this.sessionFetches.clear()
    this.eventQueues.clear()
  }

  private startStream(workspaceId: string) {
    if (this.streams.has(workspaceId)) {
      return
    }

    const controller = new AbortController()
    const task = this.runStream(workspaceId, controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) {
          this.options.logger.warn({ workspaceId, err: error }, "Instance event stream failed")
          this.publishStatus(workspaceId, "error", error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        const active = this.streams.get(workspaceId)
        if (active?.controller === controller) {
          this.streams.delete(workspaceId)
        }
      })

    this.streams.set(workspaceId, { controller, task })
  }

  private stopStream(workspaceId: string, reason?: string) {
    const active = this.streams.get(workspaceId)
    if (!active) {
      return
    }
    active.controller.abort()
    this.streams.delete(workspaceId)
    // Clean up workspace-specific cache and queues to prevent memory leaks
    this.sessionCache.delete(workspaceId)
    // Clean up session fetches for this workspace
    for (const [key] of this.sessionFetches) {
      if (key.startsWith(`${workspaceId}:`)) {
        this.sessionFetches.delete(key)
      }
    }
    this.eventQueues.delete(workspaceId)
    this.publishStatus(workspaceId, "disconnected", reason)
  }

  private async runStream(workspaceId: string, signal: AbortSignal) {
    while (!signal.aborted) {
      const port = this.options.workspaceManager.getInstancePort(workspaceId)
      if (!port) {
        await this.delay(RECONNECT_DELAY_MS, signal)
        continue
      }

      this.publishStatus(workspaceId, "connecting")

      try {
        await this.consumeStream(workspaceId, port, signal)
      } catch (error) {
        if (signal.aborted) {
          break
        }
        this.options.logger.warn({ workspaceId, err: error }, "Instance event stream disconnected")
        this.publishStatus(workspaceId, "error", error instanceof Error ? error.message : String(error))
        await this.delay(RECONNECT_DELAY_MS, signal)
      }
    }
  }

  private async consumeStream(workspaceId: string, port: number, signal: AbortSignal) {
    const url = `http://${INSTANCE_HOST}:${port}/global/event`

    const headers: Record<string, string> = { Accept: "text/event-stream" }
    const authHeader = this.options.workspaceManager.getInstanceAuthorizationHeader(workspaceId)
    if (authHeader) {
      headers["Authorization"] = authHeader
    }

    const response = await fetch(url, {
      headers,
      signal,
      dispatcher: STREAM_AGENT,
    })

    if (!response.ok || !response.body) {
      throw new Error(`Instance event stream unavailable (${response.status})`)
    }

    this.publishStatus(workspaceId, "connected")

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done || !value) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      buffer = this.flushEvents(buffer, workspaceId)
    }
  }

  private flushEvents(buffer: string, workspaceId: string) {
    let separatorIndex = buffer.indexOf("\n\n")

    while (separatorIndex >= 0) {
      const chunk = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      this.processChunk(chunk, workspaceId)
      separatorIndex = buffer.indexOf("\n\n")
    }

    return buffer
  }

  private processChunk(chunk: string, workspaceId: string) {
    const lines = chunk.split(/\r?\n/)
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith(":")) {
        continue
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    if (dataLines.length === 0) {
      return
    }

    const payload = dataLines.join("\n").trim()
    if (!payload) {
      return
    }

    try {
      const parsed = JSON.parse(payload) as any
      if (!parsed || typeof parsed !== "object") {
        this.options.logger.warn({ workspaceId, chunk: payload }, "Dropped malformed instance event")
        return
      }

      // OpenCode SSE payload shapes vary across versions.
      // Common variants:
      // - { type, properties, ... }
      // - { payload: { type, properties, ... }, directory: "/abs/path" }
      // - { payload: { type, properties, ... } }
      const base = parsed.payload && typeof parsed.payload === "object" ? parsed.payload : parsed

      const event: InstanceStreamEvent | null = base && typeof base === "object" ? ({ ...base } as any) : null

      // Attach directory when available (don't overwrite if already present).
      if (event && !(event as any).directory && typeof (parsed as any).directory === "string") {
        ;(event as any).directory = (parsed as any).directory
      }

      if (!event || typeof (event as any).type !== "string") {
        this.options.logger.warn({ workspaceId, chunk: payload }, "Dropped malformed instance event")
        return
      }

      this.options.logger.debug({ workspaceId, eventType: (event as any).type }, "Instance SSE event received")
      if (this.options.logger.isLevelEnabled("trace")) {
        this.options.logger.trace({ workspaceId, event }, "Instance SSE event payload")
      }
      this.enqueueEvent(workspaceId, event)
    } catch (error) {
      this.options.logger.warn({ workspaceId, chunk: payload, err: error }, "Failed to parse instance SSE payload")
    }
  }

  private enqueueEvent(workspaceId: string, event: InstanceStreamEvent) {
    const previous = this.eventQueues.get(workspaceId) ?? Promise.resolve()
    const next = previous
      .then(() => this.handleInstanceEvent(workspaceId, event))
      .catch((error) => {
        this.options.logger.warn({ workspaceId, err: error, eventType: event.type }, "Failed to handle instance event")
      })
    this.eventQueues.set(workspaceId, next)
  }

  private getSessionCache(workspaceId: string): Map<string, SessionCacheEntry> {
    const existing = this.sessionCache.get(workspaceId)
    if (existing) return existing
    const created = new Map<string, SessionCacheEntry>()
    this.sessionCache.set(workspaceId, created)
    return created
  }

  private mergeCachedParentId(
    cache: Map<string, SessionCacheEntry>,
    sessionId: string,
    parentID: string | null,
    parentIdKnown: boolean,
    verified: boolean,
  ) {
    const existing = cache.get(sessionId)
    // If the incoming payload doesn't actually include parentID, treat it as "unknown" and
    // avoid overwriting a previously-known value.
    const nextKnown = parentIdKnown || existing?.parentIdKnown || false
    const nextVerified = verified || existing?.verified || false
    const nextParentID = parentIdKnown ? parentID : (existing?.parentID ?? parentID)
    cache.set(sessionId, { parentID: nextParentID ?? null, parentIdKnown: nextKnown, verified: nextVerified })
  }

  private async handleInstanceEvent(workspaceId: string, event: InstanceStreamEvent) {
    if (event.type === "session.updated") {
      const info = (event as any)?.properties?.info
      const sessionId = info?.id
      if (typeof sessionId === "string") {
        const hasParentIdField = info && typeof info === "object" && Object.prototype.hasOwnProperty.call(info, "parentID")
        const parentID = typeof info?.parentID === "string" ? info.parentID : null
        const verified = hasParentIdField && parentID !== null
        const cache = this.getSessionCache(workspaceId)
        this.mergeCachedParentId(cache, sessionId, parentID, hasParentIdField, verified)
      }
      this.options.eventBus.publish({ type: "instance.event", instanceId: workspaceId, event })
      return
    }

    if (event.type === "message.updated") {
      const info = (event as any)?.properties?.info
      const sessionId = info?.sessionID
      if (typeof sessionId === "string") {
        const cache = this.getSessionCache(workspaceId)
        const cached = cache.get(sessionId)
        // If we've never seen this session OR we have not verified the session via the
        // session endpoint yet, fetch it once and emit a synthetic session.updated BEFORE
        // publishing message.updated.
        if (!cached || !cached.verified) {
          const sessionInfo = await this.getSessionInfo(workspaceId, sessionId)
          if (sessionInfo && typeof sessionInfo.id === "string") {
            const syntheticEvent = {
              type: "session.updated",
              properties: {
                info: sessionInfo,
              },
            }
            // Update cache from the source-of-truth payload, then process synchronously to
            // preserve ordering (session.updated before message.updated).
            const hasParentIdField = sessionInfo && typeof sessionInfo === "object" && Object.prototype.hasOwnProperty.call(sessionInfo, "parentID")
            const parentID = typeof sessionInfo.parentID === "string" ? sessionInfo.parentID : null
            this.mergeCachedParentId(cache, sessionInfo.id, parentID, hasParentIdField, true)
            await this.handleInstanceEvent(workspaceId, syntheticEvent as any)
          }
        }
      }
      this.options.eventBus.publish({ type: "instance.event", instanceId: workspaceId, event })
      return
    }

    this.options.eventBus.publish({ type: "instance.event", instanceId: workspaceId, event })
  }

  private async getSessionInfo(workspaceId: string, sessionId: string): Promise<any | null> {
    const key = `${workspaceId}:${sessionId}`
    const existing = this.sessionFetches.get(key)
    if (existing) {
      return existing
    }

    const task = (async () => {
      const port = this.options.workspaceManager.getInstancePort(workspaceId)
      if (!port) return null

      const url = `http://${INSTANCE_HOST}:${port}/session/${sessionId}`
      const headers: Record<string, string> = {}
      const authHeader = this.options.workspaceManager.getInstanceAuthorizationHeader(workspaceId)
      if (authHeader) {
        headers["Authorization"] = authHeader
      }

      try {
        const response = await fetch(url, { headers })
        if (!response.ok) {
          this.options.logger.debug({ workspaceId, sessionId, status: response.status }, "Failed to fetch session info")
          return null
        }
        return (await response.json()) as any
      } catch (error) {
        this.options.logger.debug({ workspaceId, sessionId, err: error }, "Failed to fetch session info")
        return null
      }
    })()

    this.sessionFetches.set(key, task)
    task.finally(() => this.sessionFetches.delete(key)).catch(() => {})
    return task
  }

  private publishStatus(instanceId: string, status: InstanceStreamStatus, reason?: string) {
    this.options.logger.debug({ instanceId, status, reason }, "Instance SSE status updated")
    this.options.eventBus.publish({ type: "instance.eventStatus", instanceId, status, reason })
  }

  private delay(duration: number, signal: AbortSignal) {
    if (duration <= 0) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      }, duration)

      const onAbort = () => {
        clearTimeout(timeout)
        resolve()
      }

      signal.addEventListener("abort", onAbort, { once: true })
    })
  }
}
