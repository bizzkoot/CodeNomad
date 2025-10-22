import { instances, activeInstanceId, setActiveInstanceId } from "../stores/instances"
import { activeSessionId, setActiveSession, getSessions } from "../stores/sessions"

export function setupTabKeyboardShortcuts(
  handleNewInstance: () => void,
  handleNewSession: (instanceId: string) => void,
  handleCloseSession: (instanceId: string, sessionId: string) => void,
) {
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
      e.preventDefault()
      const index = parseInt(e.key) - 1
      const instanceIds = Array.from(instances().keys())
      if (instanceIds[index]) {
        setActiveInstanceId(instanceIds[index])
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === "n") {
      e.preventDefault()
      handleNewInstance()
    }

    if ((e.metaKey || e.ctrlKey) && e.key === "t") {
      e.preventDefault()
      const instanceId = activeInstanceId()
      if (instanceId) {
        handleNewSession(instanceId)
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === "w") {
      e.preventDefault()
      const instanceId = activeInstanceId()
      if (!instanceId) return

      const sessionId = activeSessionId().get(instanceId)
      if (sessionId && sessionId !== "logs") {
        handleCloseSession(instanceId, sessionId)
      }
    }
  })
}
