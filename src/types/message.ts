export interface RenderCache {
  text: string
  html: string
  theme?: string
}

export interface MessageDisplayParts {
  text: any[]
  tool: any[]
  reasoning: any[]
  combined: any[]
  showThinking: boolean
  version: number
}

export interface Message {
  id: string
  sessionId: string
  type: "user" | "assistant"
  parts: any[]
  timestamp: number
  status: "sending" | "sent" | "streaming" | "complete" | "error"
  version: number
  displayParts?: MessageDisplayParts
}

export interface TextPart {
  id?: string
  type: "text"
  text: string
  version?: number
  synthetic?: boolean
  renderCache?: RenderCache
}

function hasTextSegment(segment: unknown): boolean {
  if (typeof segment === "string") {
    return segment.trim().length > 0
  }

  if (segment && typeof segment === "object") {
    const maybeText = (segment as { text?: unknown }).text
    if (typeof maybeText === "string") {
      return maybeText.trim().length > 0
    }
  }

  return false
}

export function partHasRenderableText(part: any): boolean {
  if (!part || typeof part !== "object") {
    return false
  }

  if (hasTextSegment(part.text)) {
    return true
  }

  const contentArray = Array.isArray(part?.content) ? part.content : []
  for (const item of contentArray) {
    if (hasTextSegment(item)) {
      return true
    }
  }

  const thinkingContent = Array.isArray(part?.thinking?.content) ? part.thinking.content : []
  for (const chunk of thinkingContent) {
    if (hasTextSegment(chunk)) {
      return true
    }
  }

  return false
}
