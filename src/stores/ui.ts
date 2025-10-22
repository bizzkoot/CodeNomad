import { createSignal } from "solid-js"

const [hasInstances, setHasInstances] = createSignal(false)
const [selectedFolder, setSelectedFolder] = createSignal<string | null>(null)
const [isSelectingFolder, setIsSelectingFolder] = createSignal(false)
const [sessionPickerInstance, setSessionPickerInstance] = createSignal<string | null>(null)

const [instanceTabOrder, setInstanceTabOrder] = createSignal<string[]>([])
const [sessionTabOrder, setSessionTabOrder] = createSignal<Map<string, string[]>>(new Map())

function showSessionPicker(instanceId: string) {
  setSessionPickerInstance(instanceId)
}

function hideSessionPicker() {
  setSessionPickerInstance(null)
}

function reorderInstanceTabs(newOrder: string[]) {
  setInstanceTabOrder(newOrder)
}

function reorderSessionTabs(instanceId: string, newOrder: string[]) {
  setSessionTabOrder((prev) => {
    const next = new Map(prev)
    next.set(instanceId, newOrder)
    return next
  })
}

export {
  hasInstances,
  setHasInstances,
  selectedFolder,
  setSelectedFolder,
  isSelectingFolder,
  setIsSelectingFolder,
  sessionPickerInstance,
  showSessionPicker,
  hideSessionPicker,
  instanceTabOrder,
  setInstanceTabOrder,
  sessionTabOrder,
  setSessionTabOrder,
  reorderInstanceTabs,
  reorderSessionTabs,
}
