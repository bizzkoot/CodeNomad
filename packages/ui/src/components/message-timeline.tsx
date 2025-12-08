import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Component } from "solid-js"
import MessagePreview from "./message-preview"
import { messageStoreBus } from "../stores/message-v2/bus"
import type { ClientPart } from "../types/message"
import type { MessageRecord } from "../stores/message-v2/types"
import { buildRecordDisplayData } from "../stores/message-v2/record-display-cache"

export type TimelineSegmentType = "user" | "assistant" | "tool"

export interface TimelineSegment {
  id: string
  messageId: string
  type: TimelineSegmentType
  label: string
  tooltip: string
}

interface MessageTimelineProps {
  segments: TimelineSegment[]
  onSegmentClick?: (segment: TimelineSegment) => void
  activeMessageId?: string | null
  instanceId: string
  sessionId: string
}

const SEGMENT_LABELS: Record<TimelineSegmentType, string> = {
  user: "You",
  assistant: "Asst",
  tool: "Tool",
}

const SEGMENT_SHORT_LABELS: Record<TimelineSegmentType, string> = {
  user: "U",
  assistant: "A",
  tool: "Tool",
}

const TOOL_FALLBACK_LABEL = "Tool Call"
const MAX_TOOLTIP_LENGTH = 220

type ToolCallPart = Extract<ClientPart, { type: "tool" }>

interface PendingSegment {
  type: TimelineSegmentType
  texts: string[]
  reasoningTexts: string[]
  toolTitles: string[]
  hasPrimaryText: boolean
}

function truncateText(value: string): string {
  if (value.length <= MAX_TOOLTIP_LENGTH) {
    return value
  }
  return `${value.slice(0, MAX_TOOLTIP_LENGTH - 1).trimEnd()}…`
}

function collectReasoningText(part: ClientPart): string {
  const stringifySegment = (segment: unknown): string => {
    if (typeof segment === "string") {
      return segment
    }
    if (segment && typeof segment === "object") {
      const obj = segment as { text?: unknown; value?: unknown; content?: unknown[] }
      const parts: string[] = []
      if (typeof obj.text === "string") {
        parts.push(obj.text)
      }
      if (typeof obj.value === "string") {
        parts.push(obj.value)
      }
      if (Array.isArray(obj.content)) {
        parts.push(obj.content.map((entry) => stringifySegment(entry)).join("\n"))
      }
      return parts.filter(Boolean).join("\n")
    }
    return ""
  }

  if (typeof (part as any)?.text === "string") {
    return (part as any).text
  }
  if (Array.isArray((part as any)?.content)) {
    return (part as any).content.map((entry: unknown) => stringifySegment(entry)).join("\n")
  }
  return ""
}

function collectTextFromPart(part: ClientPart): string {
  if (!part) return ""
  if (typeof (part as any).text === "string") {
    return (part as any).text as string
  }
  if (part.type === "reasoning") {
    return collectReasoningText(part)
  }
  if (Array.isArray((part as any)?.content)) {
    return ((part as any).content as unknown[])
      .map((entry) => (typeof entry === "string" ? entry : ""))
      .filter(Boolean)
      .join("\n")
  }
  if (part.type === "file") {
    const filename = (part as any)?.filename
    return typeof filename === "string" && filename.length > 0 ? `[File] ${filename}` : "Attachment"
  }
  return ""
}

function getToolTitle(part: ToolCallPart): string {
  const metadata = (((part as unknown as { state?: { metadata?: unknown } })?.state?.metadata) || {}) as { title?: unknown }
  const title = typeof metadata.title === "string" && metadata.title.length > 0 ? metadata.title : undefined
  if (title) return title
  if (typeof part.tool === "string" && part.tool.length > 0) {
    return part.tool
  }
  return TOOL_FALLBACK_LABEL
}

function formatTextsTooltip(texts: string[], fallback: string): string {
  const combined = texts
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n")
  if (combined.length > 0) {
    return truncateText(combined)
  }
  return fallback
}

function formatToolTooltip(titles: string[]): string {
  if (titles.length === 0) {
    return TOOL_FALLBACK_LABEL
  }
  return truncateText(`${TOOL_FALLBACK_LABEL}: ${titles.join(", ")}`)
}

export function buildTimelineSegments(instanceId: string, record: MessageRecord): TimelineSegment[] {
  if (!record) return []
  const { orderedParts } = buildRecordDisplayData(instanceId, record)
  if (!orderedParts || orderedParts.length === 0) {
    return []
  }

  const result: TimelineSegment[] = []
  let segmentIndex = 0
  let pending: PendingSegment | null = null
  const flushPending = () => {
    if (!pending) return
    if (pending.type === "assistant" && !pending.hasPrimaryText) {
      pending = null
      return
    }
    const label = pending.type === "tool" ? (pending.toolTitles[0] || SEGMENT_LABELS[pending.type]) : SEGMENT_LABELS[pending.type]
    const tooltip = pending.type === "tool"
      ? formatToolTooltip(pending.toolTitles)
      : formatTextsTooltip(
          [...pending.texts, ...pending.reasoningTexts],
          pending.type === "user" ? "User message" : "Assistant response",
        )
 
    result.push({
      id: `${record.id}:${segmentIndex}`,
      messageId: record.id,
      type: pending.type,
      label,
      tooltip,
    })
    segmentIndex += 1
    pending = null
  }
 
  const ensureSegment = (type: TimelineSegmentType) => {
    if (!pending || pending.type !== type) {
      flushPending()
      pending = { type, texts: [], reasoningTexts: [], toolTitles: [], hasPrimaryText: type !== "assistant" }
    }
    return pending
  }


  const defaultContentType: TimelineSegmentType = record.role === "user" ? "user" : "assistant"

  for (const part of orderedParts) {
    if (!part || typeof part !== "object") continue

    if (part.type === "tool") {
      const target = ensureSegment("tool")
      target.toolTitles.push(getToolTitle(part as ToolCallPart))
      continue
    }

    if (part.type === "reasoning") {
      const text = collectReasoningText(part)
      if (text.trim().length === 0) continue
      const target = ensureSegment(defaultContentType)
      if (target) {
        target.reasoningTexts.push(text)
      }
      continue
    }
 
    if (part.type === "step-start" || part.type === "step-finish") {
      continue
    }
 
    const text = collectTextFromPart(part)
    if (text.trim().length === 0) continue
    const target = ensureSegment(defaultContentType)
    if (target) {
      target.texts.push(text)
      target.hasPrimaryText = true
    }
  }


  flushPending()
 
  return result
}

const MessageTimeline: Component<MessageTimelineProps> = (props) => {
  const buttonRefs = new Map<string, HTMLButtonElement>()
  const store = () => messageStoreBus.getOrCreate(props.instanceId)
  const [hoveredSegment, setHoveredSegment] = createSignal<TimelineSegment | null>(null)
  const [tooltipCoords, setTooltipCoords] = createSignal<{ top: number; left: number }>({ top: 0, left: 0 })
  let hoverTimer: number | null = null
 
  const registerButtonRef = (segmentId: string, element: HTMLButtonElement | null) => {
    if (element) {
      buttonRefs.set(segmentId, element)
    } else {
      buttonRefs.delete(segmentId)
    }
  }
 
  const clearHoverTimer = () => {
    if (hoverTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(hoverTimer)
      hoverTimer = null
    }
  }
 
  const handleMouseEnter = (segment: TimelineSegment, event: MouseEvent) => {
    if (typeof window === "undefined") return
    clearHoverTimer()
    const target = event.currentTarget as HTMLButtonElement
    hoverTimer = window.setTimeout(() => {
      const rect = target.getBoundingClientRect()
      const preferredTop = rect.top + rect.height / 2
      const clampedTop = Math.min(window.innerHeight - 220, Math.max(16, preferredTop - 110))
      const tooltipWidth = 360
      const preferredLeft = rect.right + 12
      const clampedLeft = Math.min(window.innerWidth - tooltipWidth - 16, preferredLeft)
      setTooltipCoords({ top: clampedTop, left: clampedLeft })
      setHoveredSegment(segment)
    }, 200)
  }
 
  const handleMouseLeave = () => {
    clearHoverTimer()
    setHoveredSegment(null)
  }
 
  onCleanup(() => clearHoverTimer())
 
  createEffect(() => {
    const activeId = props.activeMessageId
    if (!activeId) return
    const targetSegment = props.segments.find((segment) => segment.messageId === activeId)
    if (!targetSegment) return
    const element = buttonRefs.get(targetSegment.id)
    if (!element) return
    const timer = typeof window !== "undefined" ? window.setTimeout(() => {
      element.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }, 120) : null
    onCleanup(() => {
      if (timer !== null && typeof window !== "undefined") {
        window.clearTimeout(timer)
      }
    })
  })
 
  const previewData = createMemo(() => {
    const segment = hoveredSegment()
    if (!segment) return null
    const record = store().getMessage(segment.messageId)
    if (!record) return null
    return { messageId: segment.messageId }
  })
 
  return (
    <div class="message-timeline" role="navigation" aria-label="Message timeline">
      <For each={props.segments}>
        {(segment) => {
          onCleanup(() => buttonRefs.delete(segment.id))
          const isActive = () => props.activeMessageId === segment.messageId
          return (
            <button
              ref={(el) => registerButtonRef(segment.id, el)}
              type="button"
              class={`message-timeline-segment message-timeline-${segment.type} ${isActive() ? "message-timeline-segment-active" : ""}`}
              aria-current={isActive() ? "true" : undefined}
              onClick={() => props.onSegmentClick?.(segment)}
              onMouseEnter={(event) => handleMouseEnter(segment, event)}
              onMouseLeave={handleMouseLeave}
            >
              <span class="message-timeline-label message-timeline-label-full">{segment.label}</span>
              <span class="message-timeline-label message-timeline-label-short">
                {segment.type === "tool" ? (segment.label.slice(0, 4).toUpperCase()) : SEGMENT_SHORT_LABELS[segment.type]}
              </span>
            </button>
          )
        }}
      </For>
      <Show when={previewData()}>
        {(data) => (
          <div class="message-timeline-tooltip" style={{ top: `${tooltipCoords().top}px`, left: `${tooltipCoords().left}px` }}>
            <MessagePreview
              messageId={data().messageId}
              instanceId={props.instanceId}
              sessionId={props.sessionId}
              store={store}
            />
          </div>
        )}
      </Show>
    </div>
  )
}
 
export default MessageTimeline

