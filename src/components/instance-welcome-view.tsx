import { Component, createSignal, Show, For, createEffect, onMount, onCleanup } from "solid-js"
import type { Instance } from "../types/instance"
import { getParentSessions, createSession, setActiveParentSession, agents } from "../stores/sessions"

interface InstanceWelcomeViewProps {
  instance: Instance
}

const InstanceWelcomeView: Component<InstanceWelcomeViewProps> = (props) => {
  const [selectedAgent, setSelectedAgent] = createSignal<string>("")
  const [isCreating, setIsCreating] = createSignal(false)
  const [isLoadingMetadata, setIsLoadingMetadata] = createSignal(true)
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [focusMode, setFocusMode] = createSignal<"sessions" | "new-session" | null>("sessions")

  const parentSessions = () => getParentSessions(props.instance.id)
  const agentList = () => agents().get(props.instance.id) || []
  const metadata = () => props.instance.metadata

  createEffect(() => {
    const list = agentList()
    if (list.length > 0 && !selectedAgent()) {
      setSelectedAgent(list[0].name)
    }
  })

  createEffect(() => {
    const sessions = parentSessions()
    if (sessions.length === 0) {
      setFocusMode("new-session")
      setSelectedIndex(0)
    } else {
      setFocusMode("sessions")
      setSelectedIndex(0)
    }
  })

  onMount(async () => {
    await loadInstanceMetadata()
  })

  async function loadInstanceMetadata() {
    if (!props.instance.client) return

    setIsLoadingMetadata(true)
    try {
      const [projectResult, mcpResult] = await Promise.allSettled([
        props.instance.client.project.current(),
        props.instance.client.mcp.status(),
      ])

      const project = projectResult.status === "fulfilled" ? projectResult.value.data : undefined
      const mcpStatus = mcpResult.status === "fulfilled" ? mcpResult.value.data : undefined

      const { updateInstance } = await import("../stores/instances")
      updateInstance(props.instance.id, {
        metadata: {
          project,
          mcpStatus,
          version: "0.15.8",
        },
      })
    } catch (error) {
      console.error("Failed to load instance metadata:", error)
    } finally {
      setIsLoadingMetadata(false)
    }
  }

  function scrollToIndex(index: number) {
    const element = document.querySelector(`[data-session-index="${index}"]`)
    if (element) {
      element.scrollIntoView({ block: "nearest", behavior: "auto" })
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const sessions = parentSessions()

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleNewSession()
      return
    }

    if (sessions.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      const newIndex = Math.min(selectedIndex() + 1, sessions.length - 1)
      setSelectedIndex(newIndex)
      setFocusMode("sessions")
      scrollToIndex(newIndex)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const newIndex = Math.max(selectedIndex() - 1, 0)
      setSelectedIndex(newIndex)
      setFocusMode("sessions")
      scrollToIndex(newIndex)
    } else if (e.key === "PageDown") {
      e.preventDefault()
      const pageSize = 5
      const newIndex = Math.min(selectedIndex() + pageSize, sessions.length - 1)
      setSelectedIndex(newIndex)
      setFocusMode("sessions")
      scrollToIndex(newIndex)
    } else if (e.key === "PageUp") {
      e.preventDefault()
      const pageSize = 5
      const newIndex = Math.max(selectedIndex() - pageSize, 0)
      setSelectedIndex(newIndex)
      setFocusMode("sessions")
      scrollToIndex(newIndex)
    } else if (e.key === "Home") {
      e.preventDefault()
      setSelectedIndex(0)
      setFocusMode("sessions")
      scrollToIndex(0)
    } else if (e.key === "End") {
      e.preventDefault()
      const newIndex = sessions.length - 1
      setSelectedIndex(newIndex)
      setFocusMode("sessions")
      scrollToIndex(newIndex)
    } else if (e.key === "Enter") {
      e.preventDefault()
      handleEnterKey()
    }
  }

  async function handleEnterKey() {
    const sessions = parentSessions()
    const index = selectedIndex()

    if (index < sessions.length) {
      await handleSessionSelect(sessions[index].id)
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown)
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown)
    })
  })

  function formatRelativeTime(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return "just now"
  }

  function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString()
  }

  async function handleSessionSelect(sessionId: string) {
    setActiveParentSession(props.instance.id, sessionId)
  }

  async function handleNewSession() {
    if (isCreating() || agentList().length === 0) return

    setIsCreating(true)
    try {
      const session = await createSession(props.instance.id, selectedAgent())
      setActiveParentSession(props.instance.id, session.id)
    } catch (error) {
      console.error("Failed to create session:", error)
    } finally {
      setIsCreating(false)
    }
  }

  function parseMcpStatus(status: unknown): Array<{ name: string; status: "running" | "stopped" | "error" }> {
    if (!status || typeof status !== "object") return []

    try {
      const obj = status as Record<string, string>
      return Object.entries(obj).map(([name, statusValue]) => {
        let mappedStatus: "running" | "stopped" | "error"

        if (statusValue === "connected") {
          mappedStatus = "running"
        } else if (statusValue === "disabled") {
          mappedStatus = "stopped"
        } else if (statusValue === "failed") {
          mappedStatus = "error"
        } else {
          mappedStatus = "stopped"
        }

        return {
          name,
          status: mappedStatus,
        }
      })
    } catch {
      return []
    }
  }

  const mcpServers = () => {
    const status = metadata()?.mcpStatus
    return parseMcpStatus(status)
  }

  return (
    <div class="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <div class="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-auto">
        <div class="flex-1 flex flex-col gap-4 min-h-0">
          <Show
            when={parentSessions().length > 0}
            fallback={
              <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center flex-shrink-0">
                <div class="text-gray-400 mb-2">
                  <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <p class="text-gray-600 font-medium text-sm">No Previous Sessions</p>
                <p class="text-xs text-gray-500">Create a new session below to get started</p>
              </div>
            }
          >
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-shrink-0">
              <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h2 class="text-base font-semibold text-gray-900">Resume Session</h2>
                <p class="text-xs text-gray-500 mt-0.5">
                  {parentSessions().length} {parentSessions().length === 1 ? "session" : "sessions"} available
                </p>
              </div>
              <div class="max-h-[400px] overflow-y-auto">
                <For each={parentSessions()}>
                  {(session, index) => (
                    <button
                      data-session-index={index()}
                      class="w-full text-left px-4 py-2.5 border-b border-gray-100 hover:bg-blue-50 transition-all group focus:outline-none"
                      classList={{
                        "bg-blue-100 ring-2 ring-blue-500 ring-inset":
                          focusMode() === "sessions" && selectedIndex() === index(),
                        "hover:bg-blue-50": focusMode() !== "sessions" || selectedIndex() !== index(),
                      }}
                      onClick={() => handleSessionSelect(session.id)}
                      onMouseEnter={() => {
                        setFocusMode("sessions")
                        setSelectedIndex(index())
                      }}
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span
                              class="text-sm font-medium text-gray-900 group-hover:text-blue-700 truncate"
                              classList={{
                                "text-blue-700": focusMode() === "sessions" && selectedIndex() === index(),
                              }}
                            >
                              {session.title || "Untitled Session"}
                            </span>
                          </div>
                          <div class="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                            <span>{session.agent}</span>
                            <span>•</span>
                            <span>{formatRelativeTime(session.time.updated)}</span>
                          </div>
                        </div>
                        <Show when={focusMode() === "sessions" && selectedIndex() === index()}>
                          <kbd class="px-1.5 py-0.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded flex-shrink-0">
                            ↵
                          </kbd>
                        </Show>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-shrink-0">
            <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 class="text-base font-semibold text-gray-900">Start New Session</h2>
              <p class="text-xs text-gray-500 mt-0.5">Create a fresh conversation with your chosen agent</p>
            </div>
            <div class="p-4">
              <Show when={agentList().length > 0} fallback={<div class="text-sm text-gray-500">Loading agents...</div>}>
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1.5">Agent</label>
                    <select
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      value={selectedAgent()}
                      onChange={(e) => setSelectedAgent(e.currentTarget.value)}
                    >
                      <For each={agentList()}>
                        {(agent) => (
                          <option value={agent.name}>
                            {agent.name}
                            {agent.description ? ` - ${agent.description}` : ""}
                          </option>
                        )}
                      </For>
                    </select>
                  </div>

                  <button
                    class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-between text-sm relative group"
                    onClick={handleNewSession}
                    disabled={isCreating() || agentList().length === 0}
                  >
                    <Show
                      when={!isCreating()}
                      fallback={
                        <>
                          <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                            <path
                              class="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          Creating...
                        </>
                      }
                    >
                      <div class="flex items-center gap-2 flex-1 justify-center">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Create Session</span>
                      </div>
                      <kbd class="px-1.5 py-0.5 text-xs font-semibold bg-blue-700 border border-blue-500 rounded flex-shrink-0">
                        Cmd+Enter
                      </kbd>
                    </Show>
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </div>

        <div class="lg:w-80 flex-shrink-0">
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 sticky top-0">
            <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 class="text-base font-semibold text-gray-900">Instance Information</h2>
            </div>
            <div class="p-4 space-y-3">
              <div>
                <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Folder</div>
                <div class="text-xs text-gray-900 font-mono break-all bg-gray-50 px-2 py-1.5 rounded border border-gray-200">
                  {props.instance.folder}
                </div>
              </div>

              <Show when={!isLoadingMetadata() && metadata()?.project}>
                {(project) => (
                  <>
                    <div>
                      <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Project</div>
                      <div class="text-xs text-gray-900 font-mono bg-gray-50 px-2 py-1.5 rounded border border-gray-200 truncate">
                        {project().id}
                      </div>
                    </div>

                    <Show when={project().vcs}>
                      <div>
                        <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Version Control
                        </div>
                        <div class="flex items-center gap-2 text-xs text-gray-900">
                          <svg class="w-3.5 h-3.5 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                          </svg>
                          <span class="capitalize">{project().vcs}</span>
                        </div>
                      </div>
                    </Show>
                  </>
                )}
              </Show>

              <Show when={metadata()?.version}>
                <div>
                  <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">OpenCode Version</div>
                  <div class="text-xs text-gray-900 bg-gray-50 px-2 py-1.5 rounded border border-gray-200">
                    v{metadata()?.version}
                  </div>
                </div>
              </Show>

              <Show when={props.instance.binaryPath}>
                <div>
                  <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Binary Path</div>
                  <div class="text-xs text-gray-900 font-mono break-all bg-gray-50 px-2 py-1.5 rounded border border-gray-200">
                    {props.instance.binaryPath}
                  </div>
                </div>
              </Show>

              <Show when={!isLoadingMetadata() && mcpServers().length > 0}>
                <div>
                  <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">MCP Servers</div>
                  <div class="space-y-1.5">
                    <For each={mcpServers()}>
                      {(server) => (
                        <div class="flex items-center justify-between px-2 py-1.5 bg-gray-50 rounded border border-gray-200">
                          <span class="text-xs text-gray-900 font-medium truncate">{server.name}</span>
                          <div class="flex items-center gap-1.5 flex-shrink-0">
                            <Show
                              when={server.status === "running"}
                              fallback={
                                <Show
                                  when={server.status === "error"}
                                  fallback={<div class="w-1.5 h-1.5 rounded-full bg-gray-400" />}
                                >
                                  <div class="w-1.5 h-1.5 rounded-full bg-red-500" />
                                </Show>
                              }
                            >
                              <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              <Show when={isLoadingMetadata()}>
                <div class="text-xs text-gray-500 py-1">
                  <div class="flex items-center gap-1.5">
                    <svg class="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Loading...
                  </div>
                </div>
              </Show>

              <div>
                <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Server</div>
                <div class="space-y-1 text-xs">
                  <div class="flex justify-between items-center">
                    <span class="text-gray-600">Port:</span>
                    <span class="text-gray-900 font-mono">{props.instance.port}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-600">PID:</span>
                    <span class="text-gray-900 font-mono">{props.instance.pid}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-600">Status:</span>
                    <span
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
                      classList={{
                        "bg-green-100 text-green-800": props.instance.status === "ready",
                        "bg-yellow-100 text-yellow-800": props.instance.status === "starting",
                        "bg-red-100 text-red-800": props.instance.status === "error",
                        "bg-gray-100 text-gray-800": props.instance.status === "stopped",
                      }}
                    >
                      <div
                        class="w-1 h-1 rounded-full"
                        classList={{
                          "bg-green-600 animate-pulse": props.instance.status === "ready",
                          "bg-yellow-600 animate-pulse": props.instance.status === "starting",
                          "bg-red-600": props.instance.status === "error",
                          "bg-gray-600": props.instance.status === "stopped",
                        }}
                      />
                      {props.instance.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="px-4 py-2 bg-white border-t border-gray-200 flex-shrink-0">
        <div class="flex items-center justify-center flex-wrap gap-3 text-xs text-gray-500">
          <div class="flex items-center gap-1.5">
            <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs">↑</kbd>
            <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs">↓</kbd>
            <span>Navigate</span>
          </div>
          <div class="flex items-center gap-1.5">
            <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs">PgUp</kbd>
            <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs">PgDn</kbd>
            <span>Jump</span>
          </div>
          <div class="flex items-center gap-1.5">
            <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs">Home</kbd>
            <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs">End</kbd>
            <span>First/Last</span>
          </div>
          <div class="flex items-center gap-1.5">
            <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs">Enter</kbd>
            <span>Resume</span>
          </div>
          <div class="flex items-center gap-1.5">
            <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Cmd+Enter</kbd>
            <span>New Session</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InstanceWelcomeView
