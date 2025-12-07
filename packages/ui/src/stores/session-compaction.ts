import { createSignal } from "solid-js"

function makeKey(instanceId: string, sessionId: string): string {
  return `${instanceId}:${sessionId}`
}

const [compactingSessions, setCompactingSessions] = createSignal<Map<string, boolean>>(new Map())

export function setSessionCompactionState(instanceId: string, sessionId: string, isCompacting: boolean): void {
  setCompactingSessions((prev) => {
    const next = new Map(prev)
    const key = makeKey(instanceId, sessionId)
    if (isCompacting) {
      next.set(key, true)
    } else {
      next.delete(key)
    }
    return next
  })
}

export function isSessionCompactionActive(instanceId: string, sessionId: string): boolean {
  return compactingSessions().get(makeKey(instanceId, sessionId)) ?? false
}
