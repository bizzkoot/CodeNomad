import { Show } from "solid-js"
import Kbd from "./kbd"

interface MessageListHeaderProps {
  usedTokens: number
  availableTokens?: number | null
  connectionStatus: "connected" | "connecting" | "error" | "disconnected" | "unknown" | null
  onCommandPalette: () => void
  formatTokens: (value: number) => string
}

export default function MessageListHeader(props: MessageListHeaderProps) {
  const hasAvailableTokens = () => typeof props.availableTokens === "number"
  const availableDisplay = () => (hasAvailableTokens() ? props.formatTokens(props.availableTokens as number) : "--")

  return (
    <div class="connection-status">
      <div class="connection-status-text connection-status-info flex flex-wrap items-center gap-2 text-sm font-medium">
        <div class="inline-flex items-center gap-1 rounded-full border border-base px-2 py-0.5 text-xs text-primary">
          <span class="uppercase text-[10px] tracking-wide text-primary/70">Used</span>
          <span class="font-semibold text-primary">{props.formatTokens(props.usedTokens)}</span>
        </div>
        <div class="inline-flex items-center gap-1 rounded-full border border-base px-2 py-0.5 text-xs text-primary">
          <span class="uppercase text-[10px] tracking-wide text-primary/70">Avail</span>
          <span class="font-semibold text-primary">{hasAvailableTokens() ? availableDisplay() : "--"}</span>
        </div>
      </div>

      <div class="connection-status-text connection-status-shortcut">
        <div class="connection-status-shortcut-action">
          <button type="button" class="connection-status-button" onClick={props.onCommandPalette} aria-label="Open command palette">
            Command Palette
          </button>
          <span class="connection-status-shortcut-hint">
            <Kbd shortcut="cmd+shift+p" />
          </span>
        </div>
      </div>

      <div class="connection-status-meta flex items-center justify-end gap-3">
        <Show when={props.connectionStatus === "connected"}>
          <span class="status-indicator connected">
            <span class="status-dot" />
            Connected
          </span>
        </Show>
        <Show when={props.connectionStatus === "connecting"}>
          <span class="status-indicator connecting">
            <span class="status-dot" />
            Connecting...
          </span>
        </Show>
        <Show when={props.connectionStatus === "error" || props.connectionStatus === "disconnected"}>
          <span class="status-indicator disconnected">
            <span class="status-dot" />
            Disconnected
          </span>
        </Show>
      </div>
    </div>
  )
}
