import type { ClientPart } from "../../types/message"
import type { MessageRecord } from "./types"

export interface RecordDisplayData {
  orderedParts: ClientPart[]
}

interface RecordDisplayCacheEntry {
  revision: number
  data: RecordDisplayData
}

const recordDisplayCache = new Map<string, RecordDisplayCacheEntry>()

function makeCacheKey(instanceId: string, messageId: string) {
  return `${instanceId}:${messageId}`
}

export function buildRecordDisplayData(instanceId: string, record: MessageRecord): RecordDisplayData {
  const cacheKey = makeCacheKey(instanceId, record.id)
  const cached = recordDisplayCache.get(cacheKey)
  if (cached && cached.revision === record.revision) {
    return cached.data
  }

  const orderedParts: ClientPart[] = []

  for (const partId of record.partIds) {
    const entry = record.parts[partId]
    if (!entry?.data) continue
    orderedParts.push(entry.data)
  }

  const data: RecordDisplayData = { orderedParts }
  recordDisplayCache.set(cacheKey, { revision: record.revision, data })
  return data
}

export function clearRecordDisplayCacheForInstance(instanceId: string) {
  const prefix = `${instanceId}:`
  for (const key of recordDisplayCache.keys()) {
    if (key.startsWith(prefix)) {
      recordDisplayCache.delete(key)
    }
  }
}
