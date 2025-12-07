import { createSignal } from "solid-js"

const [openStates, setOpenStates] = createSignal<Map<string, boolean>>(new Map())

function updateState(instanceId: string, open: boolean) {
  setOpenStates((prev) => {
    const next = new Map(prev)
    next.set(instanceId, open)
    return next
  })
}

export function showCommandPalette(instanceId: string) {
  if (!instanceId) return
  updateState(instanceId, true)
}

export function hideCommandPalette(instanceId?: string) {
  if (!instanceId) {
    setOpenStates(new Map())
    return
  }
  updateState(instanceId, false)
}

export function toggleCommandPalette(instanceId: string) {
  if (!instanceId) return
  const current = openStates().get(instanceId) ?? false
  updateState(instanceId, !current)
}

export function isOpen(instanceId: string): boolean {
  return openStates().get(instanceId) ?? false
}

export { openStates }
