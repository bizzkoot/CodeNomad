import { type Accessor, createMemo } from "solid-js"
import { messageStoreBus } from "../../stores/message-v2/bus"
import type { ScrollSnapshot } from "../../stores/message-v2/types"

interface UseScrollCacheParams {
  instanceId: MaybeAccessor<string>
  sessionId: MaybeAccessor<string>
  scope: MaybeAccessor<string>
}

interface PersistScrollOptions {
  atBottomOffset?: number
}

interface RestoreScrollOptions {
  behavior?: ScrollBehavior
  fallback?: () => void
  onApplied?: (snapshot: ScrollSnapshot | undefined) => void
}

interface ScrollCacheHandle {
  persist: (element: HTMLElement | null | undefined, options?: PersistScrollOptions) => ScrollSnapshot | undefined
  restore: (element: HTMLElement | null | undefined, options?: RestoreScrollOptions) => void
}

const DEFAULT_BOTTOM_OFFSET = 48

/**
 * Wraps the message-store scroll snapshot helpers so components can
 * persist/restore scroll positions without duplicating requestAnimationFrame
 * boilerplate.
 */
export function useScrollCache(params: UseScrollCacheParams): ScrollCacheHandle {
  const resolved = createMemo(() => ({
    instanceId: resolveValue(params.instanceId),
    sessionId: resolveValue(params.sessionId),
    scope: resolveValue(params.scope),
  }))

  const store = createMemo(() => {
    const { instanceId } = resolved()
    return messageStoreBus.getOrCreate(instanceId)
  })

  function persist(element: HTMLElement | null | undefined, options?: PersistScrollOptions) {
    if (!element) {
      return undefined
    }
    const target = resolved()
    if (!target.sessionId) {
      return undefined
    }
    const snapshot: Omit<ScrollSnapshot, "updatedAt"> = {
      scrollTop: element.scrollTop,
      atBottom: isNearBottom(element, options?.atBottomOffset ?? DEFAULT_BOTTOM_OFFSET),
    }
    store().setScrollSnapshot(target.sessionId, target.scope, snapshot)
    return { ...snapshot, updatedAt: Date.now() }
  }

  function restore(element: HTMLElement | null | undefined, options?: RestoreScrollOptions) {
    const target = resolved()
    if (!element || !target.sessionId) {
      options?.fallback?.()
      options?.onApplied?.(undefined)
      return
    }
    const snapshot = store().getScrollSnapshot(target.sessionId, target.scope)
    requestAnimationFrame(() => {
      if (!element) {
        options?.onApplied?.(snapshot)
        return
      }
      if (!snapshot) {
        options?.fallback?.()
        options?.onApplied?.(undefined)
        return
      }
      const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 0)
      const nextTop = snapshot.atBottom ? maxScrollTop : Math.min(snapshot.scrollTop, maxScrollTop)
      const behavior = options?.behavior ?? "auto"
      element.scrollTo({ top: nextTop, behavior })
      options?.onApplied?.(snapshot)
    })
  }

  return { persist, restore }
}

function isNearBottom(element: HTMLElement, offset: number) {
  const { scrollTop, scrollHeight, clientHeight } = element
  return scrollHeight - (scrollTop + clientHeight) <= offset
}

function resolveValue<T>(value: MaybeAccessor<T>): T {
  if (typeof value === "function") {
    return (value as Accessor<T>)()
  }
  return value
}

type MaybeAccessor<T> = T | Accessor<T>
