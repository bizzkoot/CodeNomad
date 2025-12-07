import type { Permission } from "@opencode-ai/sdk"
import type { Message, MessageInfo, ClientPart } from "../../types/message"
import type { Session } from "../../types/session"
import { messageStoreBus } from "./bus"
import type { MessageStatus, SessionRevertState } from "./types"

interface SessionMetadata {
  id: string
  title?: string
  parentId?: string | null
}

function resolveSessionMetadata(session?: Session | null): SessionMetadata | undefined {
  if (!session) return undefined
  return {
    id: session.id,
    title: session.title,
    parentId: session.parentId ?? null,
  }
}

function normalizeStatus(status: Message["status"]): MessageStatus {
  switch (status) {
    case "sending":
    case "sent":
    case "streaming":
    case "complete":
    case "error":
      return status
    default:
      return "complete"
  }
}

export function seedSessionMessagesV2(
  instanceId: string,
  session: Session | SessionMetadata,
  messages: Message[],
  messageInfos?: Map<string, MessageInfo>,
): void {
  if (!session || !Array.isArray(messages)) return
  const store = messageStoreBus.getOrCreate(instanceId)
  const metadata: SessionMetadata = "id" in session ? { id: session.id, title: session.title, parentId: session.parentId ?? null } : session

  store.addOrUpdateSession({
    id: metadata.id,
    title: metadata.title,
    parentId: metadata.parentId ?? null,
    revert: (session as Session)?.revert ?? undefined,
  })

  const normalizedMessages = messages.map((message) => ({
    id: message.id,
    sessionId: message.sessionId,
    role: message.type,
    status: normalizeStatus(message.status),
    createdAt: message.timestamp,
    updatedAt: message.timestamp,
    parts: message.parts,
    isEphemeral: message.status === "sending" || message.status === "streaming",
    bumpRevision: false,
  }))

  store.hydrateMessages(metadata.id, normalizedMessages, messageInfos?.values())
}

interface MessageInfoOptions {
  status?: MessageStatus
  bumpRevision?: boolean
}

export function upsertMessageInfoV2(instanceId: string, info: MessageInfo | null | undefined, options?: MessageInfoOptions): void {
  if (!info || typeof info.id !== "string" || typeof info.sessionID !== "string") {
    return
  }
  const store = messageStoreBus.getOrCreate(instanceId)
  const timeInfo = (info.time ?? {}) as { created?: number; completed?: number }
  const createdAt = typeof timeInfo.created === "number" ? timeInfo.created : Date.now()
  const completedAt = typeof timeInfo.completed === "number" ? timeInfo.completed : undefined

  store.upsertMessage({
    id: info.id,
    sessionId: info.sessionID,
    role: info.role === "user" ? "user" : "assistant",
    status: options?.status ?? "complete",
    createdAt,
    updatedAt: completedAt ?? createdAt,
    bumpRevision: Boolean(options?.bumpRevision),
  })
  store.setMessageInfo(info.id, info)
}

export function applyPartUpdateV2(instanceId: string, part: ClientPart | null | undefined): void {
  if (!part || typeof part.messageID !== "string") {
    return
  }
  const store = messageStoreBus.getOrCreate(instanceId)
  store.applyPartUpdate({
    messageId: part.messageID,
    part,
  })
}

export function replaceMessageIdV2(instanceId: string, oldId: string, newId: string): void {
  if (!oldId || !newId || oldId === newId) return
  const store = messageStoreBus.getOrCreate(instanceId)
  store.replaceMessageId({ oldId, newId })
}

function extractPermissionMessageId(permission: Permission): string | undefined {
  return (permission as any).messageID || (permission as any).messageId
}

function extractPermissionPartId(permission: Permission): string | undefined {
  const metadata = (permission as any).metadata || {}
  return (
    (permission as any).callID ||
    (permission as any).callId ||
    (permission as any).toolCallID ||
    (permission as any).toolCallId ||
    metadata.partId ||
    metadata.partID ||
    metadata.callID ||
    metadata.callId ||
    undefined
  )
}

export function upsertPermissionV2(instanceId: string, permission: Permission): void {
  if (!permission) return
  const store = messageStoreBus.getOrCreate(instanceId)
  store.upsertPermission({
    permission,
    messageId: extractPermissionMessageId(permission),
    partId: extractPermissionPartId(permission),
    enqueuedAt: (permission as any).time?.created ?? Date.now(),
  })
}

export function removePermissionV2(instanceId: string, permissionId: string): void {
  if (!permissionId) return
  const store = messageStoreBus.getOrCreate(instanceId)
  store.removePermission(permissionId)
}

export function ensureSessionMetadataV2(instanceId: string, session: Session | null | undefined): void {
  if (!session) return
  const store = messageStoreBus.getOrCreate(instanceId)
  const existingMessageIds = store.getSessionMessageIds(session.id)
  store.addOrUpdateSession({
    id: session.id,
    title: session.title,
    parentId: session.parentId ?? null,
    messageIds: existingMessageIds,
  })
}

export function getSessionMetadataFromStore(session?: Session | null): SessionMetadata | undefined {
  return resolveSessionMetadata(session ?? undefined)
}

export function setSessionRevertV2(instanceId: string, sessionId: string, revert?: SessionRevertState | null): void {
  if (!sessionId) return
  const store = messageStoreBus.getOrCreate(instanceId)
  store.setSessionRevert(sessionId, revert ?? null)
}
