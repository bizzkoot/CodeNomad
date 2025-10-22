import { createSignal } from "solid-js"
import type { Session, Agent, Provider } from "../types/session"
import type { Message } from "../types/message"
import { instances } from "./instances"

const [sessions, setSessions] = createSignal<Map<string, Map<string, Session>>>(new Map())
const [activeSessionId, setActiveSessionId] = createSignal<Map<string, string>>(new Map())
const [activeParentSessionId, setActiveParentSessionId] = createSignal<Map<string, string>>(new Map())
const [agents, setAgents] = createSignal<Map<string, Agent[]>>(new Map())
const [providers, setProviders] = createSignal<Map<string, Provider[]>>(new Map())

const [loading, setLoading] = createSignal({
  fetchingSessions: new Map<string, boolean>(),
  creatingSession: new Map<string, boolean>(),
  deletingSession: new Map<string, Set<string>>(),
  loadingMessages: new Map<string, Set<string>>(),
})

const [messagesLoaded, setMessagesLoaded] = createSignal<Map<string, Set<string>>>(new Map())

async function fetchSessions(instanceId: string): Promise<void> {
  const instance = instances().get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  setLoading((prev) => {
    const next = { ...prev }
    next.fetchingSessions.set(instanceId, true)
    return next
  })

  try {
    const response = await instance.client.session.list()

    const sessionMap = new Map<string, Session>()

    if (!response.data || !Array.isArray(response.data)) {
      return
    }

    for (const apiSession of response.data) {
      sessionMap.set(apiSession.id, {
        id: apiSession.id,
        instanceId,
        title: apiSession.title || "Untitled",
        parentId: apiSession.parentID || null,
        agent: "",
        model: { providerId: "", modelId: "" },
        time: {
          created: apiSession.time.created,
          updated: apiSession.time.updated,
        },
        messages: [],
        messagesInfo: new Map(),
      })
    }

    setSessions((prev) => {
      const next = new Map(prev)
      next.set(instanceId, sessionMap)
      return next
    })
  } catch (error) {
    console.error("Failed to fetch sessions:", error)
    throw error
  } finally {
    setLoading((prev) => {
      const next = { ...prev }
      next.fetchingSessions.set(instanceId, false)
      return next
    })
  }
}

async function createSession(instanceId: string, agent?: string): Promise<Session> {
  const instance = instances().get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  setLoading((prev) => {
    const next = { ...prev }
    next.creatingSession.set(instanceId, true)
    return next
  })

  try {
    const response = await instance.client.session.create()

    if (!response.data) {
      throw new Error("Failed to create session: No data returned")
    }

    const session: Session = {
      id: response.data.id,
      instanceId,
      title: response.data.title || "New Session",
      parentId: null,
      agent: agent || "",
      model: { providerId: "", modelId: "" },
      time: {
        created: response.data.time.created,
        updated: response.data.time.updated,
      },
      messages: [],
      messagesInfo: new Map(),
    }

    setSessions((prev) => {
      const next = new Map(prev)
      const instanceSessions = next.get(instanceId) || new Map()
      instanceSessions.set(session.id, session)
      next.set(instanceId, instanceSessions)
      return next
    })

    return session
  } catch (error) {
    console.error("Failed to create session:", error)
    throw error
  } finally {
    setLoading((prev) => {
      const next = { ...prev }
      next.creatingSession.set(instanceId, false)
      return next
    })
  }
}

async function deleteSession(instanceId: string, sessionId: string): Promise<void> {
  const instance = instances().get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  setLoading((prev) => {
    const next = { ...prev }
    const deleting = next.deletingSession.get(instanceId) || new Set()
    deleting.add(sessionId)
    next.deletingSession.set(instanceId, deleting)
    return next
  })

  try {
    await instance.client.session.delete({ path: { id: sessionId } })

    setSessions((prev) => {
      const next = new Map(prev)
      const instanceSessions = next.get(instanceId)
      if (instanceSessions) {
        instanceSessions.delete(sessionId)
      }
      return next
    })

    if (activeSessionId().get(instanceId) === sessionId) {
      setActiveSessionId((prev) => {
        const next = new Map(prev)
        next.delete(instanceId)
        return next
      })
    }
  } catch (error) {
    console.error("Failed to delete session:", error)
    throw error
  } finally {
    setLoading((prev) => {
      const next = { ...prev }
      const deleting = next.deletingSession.get(instanceId)
      if (deleting) {
        deleting.delete(sessionId)
      }
      return next
    })
  }
}

async function fetchAgents(instanceId: string): Promise<void> {
  const instance = instances().get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  try {
    const response = await instance.client.app.agents()
    const agentList = (response.data ?? [])
      .filter((agent) => agent.mode !== "subagent")
      .map((agent) => ({
        name: agent.name,
        description: agent.description || "",
        mode: agent.mode,
      }))

    setAgents((prev) => {
      const next = new Map(prev)
      next.set(instanceId, agentList)
      return next
    })
  } catch (error) {
    console.error("Failed to fetch agents:", error)
  }
}

async function fetchProviders(instanceId: string): Promise<void> {
  const instance = instances().get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  try {
    const response = await instance.client.config.providers()
    if (!response.data) return

    const providerList = response.data.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: Object.entries(provider.models).map(([id, model]) => ({
        id,
        name: model.name,
        providerId: provider.id,
      })),
    }))

    setProviders((prev) => {
      const next = new Map(prev)
      next.set(instanceId, providerList)
      return next
    })
  } catch (error) {
    console.error("Failed to fetch providers:", error)
  }
}

function setActiveSession(instanceId: string, sessionId: string): void {
  setActiveSessionId((prev) => {
    const next = new Map(prev)
    next.set(instanceId, sessionId)
    return next
  })
}

function setActiveParentSession(instanceId: string, parentSessionId: string): void {
  setActiveParentSessionId((prev) => {
    const next = new Map(prev)
    next.set(instanceId, parentSessionId)
    return next
  })

  setActiveSession(instanceId, parentSessionId)
}

function clearActiveParentSession(instanceId: string): void {
  setActiveParentSessionId((prev) => {
    const next = new Map(prev)
    next.delete(instanceId)
    return next
  })

  setActiveSessionId((prev) => {
    const next = new Map(prev)
    next.delete(instanceId)
    return next
  })
}

function getActiveParentSession(instanceId: string): Session | null {
  const parentId = activeParentSessionId().get(instanceId)
  if (!parentId) return null

  const instanceSessions = sessions().get(instanceId)
  return instanceSessions?.get(parentId) || null
}

function getActiveSession(instanceId: string): Session | null {
  const sessionId = activeSessionId().get(instanceId)
  if (!sessionId) return null

  const instanceSessions = sessions().get(instanceId)
  return instanceSessions?.get(sessionId) || null
}

function getSessions(instanceId: string): Session[] {
  const instanceSessions = sessions().get(instanceId)
  return instanceSessions ? Array.from(instanceSessions.values()) : []
}

function getParentSessions(instanceId: string): Session[] {
  const allSessions = getSessions(instanceId)
  return allSessions.filter((s) => s.parentId === null)
}

function getChildSessions(instanceId: string, parentId: string): Session[] {
  const allSessions = getSessions(instanceId)
  return allSessions.filter((s) => s.parentId === parentId)
}

function getSessionFamily(instanceId: string, parentId: string): Session[] {
  const parent = sessions().get(instanceId)?.get(parentId)
  if (!parent) return []

  const children = getChildSessions(instanceId, parentId)
  return [parent, ...children]
}

async function loadMessages(instanceId: string, sessionId: string): Promise<void> {
  const alreadyLoaded = messagesLoaded().get(instanceId)?.has(sessionId)
  if (alreadyLoaded) {
    return
  }

  const isLoading = loading().loadingMessages.get(instanceId)?.has(sessionId)
  if (isLoading) {
    return
  }

  const instance = instances().get(instanceId)
  if (!instance || !instance.client) {
    throw new Error("Instance not ready")
  }

  const instanceSessions = sessions().get(instanceId)
  const session = instanceSessions?.get(sessionId)
  if (!session) {
    throw new Error("Session not found")
  }

  setLoading((prev) => {
    const next = { ...prev }
    const loadingSet = next.loadingMessages.get(instanceId) || new Set()
    loadingSet.add(sessionId)
    next.loadingMessages.set(instanceId, loadingSet)
    return next
  })

  try {
    const response = await instance.client.session.messages({ path: { id: sessionId } })

    if (!response.data || !Array.isArray(response.data)) {
      return
    }

    const messagesInfo = new Map<string, any>()
    const messages: Message[] = response.data.map((apiMessage: any) => {
      const info = apiMessage.info || apiMessage
      const role = info.role || "assistant"
      const messageId = info.id || String(Date.now())

      messagesInfo.set(messageId, info)

      return {
        id: messageId,
        sessionId,
        type: role === "user" ? "user" : "assistant",
        parts: apiMessage.parts || [],
        timestamp: info.time?.created || Date.now(),
        status: "complete" as const,
      }
    })

    setSessions((prev) => {
      const next = new Map(prev)
      const instanceSessions = next.get(instanceId)
      if (instanceSessions) {
        const session = instanceSessions.get(sessionId)
        if (session) {
          const updatedInstanceSessions = new Map(instanceSessions)
          updatedInstanceSessions.set(sessionId, { ...session, messages, messagesInfo })
          next.set(instanceId, updatedInstanceSessions)
        }
      }
      return next
    })

    setMessagesLoaded((prev) => {
      const next = new Map(prev)
      const loadedSet = next.get(instanceId) || new Set()
      loadedSet.add(sessionId)
      next.set(instanceId, loadedSet)
      return next
    })
  } catch (error) {
    console.error("Failed to load messages:", error)
    throw error
  } finally {
    setLoading((prev) => {
      const next = { ...prev }
      const loadingSet = next.loadingMessages.get(instanceId)
      if (loadingSet) {
        loadingSet.delete(sessionId)
      }
      return next
    })
  }
}

export {
  sessions,
  activeSessionId,
  activeParentSessionId,
  agents,
  providers,
  loading,
  fetchSessions,
  createSession,
  deleteSession,
  fetchAgents,
  fetchProviders,
  loadMessages,
  setActiveSession,
  setActiveParentSession,
  clearActiveParentSession,
  getActiveSession,
  getActiveParentSession,
  getSessions,
  getParentSessions,
  getChildSessions,
  getSessionFamily,
}
