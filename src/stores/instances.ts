import { createSignal } from "solid-js"
import type { Instance } from "../types/instance"
import { sdkManager } from "../lib/sdk-manager"
import { fetchSessions, fetchAgents, fetchProviders } from "./sessions"
import { showSessionPicker } from "./ui"

const [instances, setInstances] = createSignal<Map<string, Instance>>(new Map())
const [activeInstanceId, setActiveInstanceId] = createSignal<string | null>(null)

function addInstance(instance: Instance) {
  setInstances((prev) => {
    const next = new Map(prev)
    next.set(instance.id, instance)
    return next
  })
}

function updateInstance(id: string, updates: Partial<Instance>) {
  setInstances((prev) => {
    const next = new Map(prev)
    const instance = next.get(id)
    if (instance) {
      next.set(id, { ...instance, ...updates })
    }
    return next
  })
}

function removeInstance(id: string) {
  setInstances((prev) => {
    const next = new Map(prev)
    next.delete(id)
    return next
  })

  if (activeInstanceId() === id) {
    setActiveInstanceId(null)
  }
}

async function createInstance(folder: string): Promise<string> {
  const tempId = `temp-${Date.now()}`

  const instance: Instance = {
    id: tempId,
    folder,
    port: 0,
    pid: 0,
    status: "starting",
    client: null,
  }

  addInstance(instance)

  try {
    const { port, pid } = await window.electronAPI.createInstance(folder)

    const client = sdkManager.createClient(port)

    updateInstance(tempId, {
      port,
      pid,
      client,
      status: "ready",
    })

    setActiveInstanceId(tempId)

    try {
      await fetchSessions(tempId)
      await fetchAgents(tempId)
      await fetchProviders(tempId)
    } catch (error) {
      console.error("Failed to fetch initial data:", error)
    }

    showSessionPicker(tempId)

    return tempId
  } catch (error) {
    updateInstance(tempId, {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function stopInstance(id: string) {
  const instance = instances().get(id)
  if (!instance) return

  if (instance.port) {
    sdkManager.destroyClient(instance.port)
  }

  if (instance.pid) {
    await window.electronAPI.stopInstance(instance.pid)
  }

  removeInstance(id)
}

function getActiveInstance(): Instance | null {
  const id = activeInstanceId()
  return id ? instances().get(id) || null : null
}

export {
  instances,
  activeInstanceId,
  setActiveInstanceId,
  addInstance,
  updateInstance,
  removeInstance,
  createInstance,
  stopInstance,
  getActiveInstance,
}
