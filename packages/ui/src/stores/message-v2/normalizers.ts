import { decodeHtmlEntities } from "../../lib/markdown"

function decodeTextSegment(segment: any): any {
  if (typeof segment === "string") {
    return decodeHtmlEntities(segment)
  }

  if (segment && typeof segment === "object") {
    const updated: Record<string, any> = { ...segment }

    if (typeof updated.text === "string") {
      updated.text = decodeHtmlEntities(updated.text)
    }

    if (typeof updated.value === "string") {
      updated.value = decodeHtmlEntities(updated.value)
    }

    if (Array.isArray(updated.content)) {
      updated.content = updated.content.map((item: any) => decodeTextSegment(item))
    }

    return updated
  }

  return segment
}

function deriveToolPartId(part: any): string | undefined {
  if (!part || typeof part !== "object") {
    return undefined
  }
  if (part.type !== "tool") {
    return undefined
  }
  const callId =
    part.callID ??
    part.callId ??
    part.toolCallID ??
    part.toolCallId ??
    undefined
  if (typeof callId === "string" && callId.length > 0) {
    return callId
  }
  return undefined
}

export function normalizeMessagePart(part: any): any {
  if (!part || typeof part !== "object") {
    return part
  }

  if ((typeof part.id !== "string" || part.id.length === 0) && part.type === "tool") {
    const inferredId = deriveToolPartId(part)
    if (inferredId) {
      part = { ...part, id: inferredId }
    }
  }

  if (part.type !== "text") {
    return part
  }

  const normalized: Record<string, any> = { ...part, renderCache: undefined }

  if (typeof normalized.text === "string") {
    normalized.text = decodeHtmlEntities(normalized.text)
  } else if (normalized.text && typeof normalized.text === "object") {
    const textObject: Record<string, any> = { ...normalized.text }

    if (typeof textObject.value === "string") {
      textObject.value = decodeHtmlEntities(textObject.value)
    }

    if (Array.isArray(textObject.content)) {
      textObject.content = textObject.content.map((item: any) => decodeTextSegment(item))
    }

    if (typeof textObject.text === "string") {
      textObject.text = decodeHtmlEntities(textObject.text)
    }

    normalized.text = textObject
  }

  if (Array.isArray(normalized.content)) {
    normalized.content = normalized.content.map((item: any) => decodeTextSegment(item))
  }

  if (normalized.thinking && typeof normalized.thinking === "object") {
    const thinking: Record<string, any> = { ...normalized.thinking }
    if (Array.isArray(thinking.content)) {
      thinking.content = thinking.content.map((item: any) => decodeTextSegment(item))
    }
    normalized.thinking = thinking
  }

  return normalized
}

