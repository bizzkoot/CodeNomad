import { Component, For } from "solid-js"
import type { Session } from "../types/session"
import SessionTab from "./session-tab"
import { Plus } from "lucide-solid"

interface SessionTabsProps {
  instanceId: string
  sessions: Map<string, Session>
  activeSessionId: string | null
  onSelect: (sessionId: string) => void
  onClose: (sessionId: string) => void
  onNew: () => void
}

const SessionTabs: Component<SessionTabsProps> = (props) => {
  const sessionsList = () => Array.from(props.sessions.entries())

  return (
    <div class="session-tabs bg-white border-b border-gray-200">
      <div class="tabs-container flex items-center gap-1 px-2 py-1 overflow-x-auto" role="tablist">
        <For each={sessionsList()}>
          {([id, session]) => (
            <SessionTab
              session={session}
              active={id === props.activeSessionId}
              isParent={session.parentId === null}
              onSelect={() => props.onSelect(id)}
              onClose={session.parentId === null ? () => props.onClose(id) : undefined}
            />
          )}
        </For>
        <SessionTab special="logs" active={props.activeSessionId === "logs"} onSelect={() => props.onSelect("logs")} />
        <button
          class="new-tab-button inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
          onClick={props.onNew}
          title="New parent session (Cmd/Ctrl+T)"
          aria-label="New parent session"
        >
          <Plus class="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default SessionTabs
