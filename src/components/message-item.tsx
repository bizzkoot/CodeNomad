import { For, Show } from "solid-js"
import type { Message, SDKPart, MessageInfo, ClientPart } from "../types/message"
import { partHasRenderableText } from "../types/message"
import MessagePart from "./message-part"

interface MessageItemProps {
  message: Message
  messageInfo?: MessageInfo
  instanceId: string
  sessionId: string
  isQueued?: boolean
  parts?: ClientPart[]
  onRevert?: (messageId: string) => void
  onFork?: (messageId?: string) => void
}

export default function MessageItem(props: MessageItemProps) {
  const isUser = () => props.message.type === "user"
  const timestamp = () => {
    const date = new Date(props.message.timestamp)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  const messageParts = () => props.parts ?? props.message.parts

  const errorMessage = () => {
    const info = props.messageInfo
    if (!info || info.role !== "assistant" || !info.error) return null

    const error = info.error
    if (error.name === "ProviderAuthError") {
      return error.data?.message || "Authentication error"
    }
    if (error.name === "MessageOutputLengthError") {
      return "Message output length exceeded"
    }
    if (error.name === "MessageAbortedError") {
      return "Request was aborted"
    }
    if (error.name === "UnknownError") {
      return error.data?.message || "Unknown error occurred"
    }
    return null
  }

  const hasContent = () => {
    if (errorMessage() !== null) {
      return true
    }

    return messageParts().some((part) => partHasRenderableText(part))
  }

  const isGenerating = () => {
    const info = props.messageInfo
    return !hasContent() && info && info.role === "assistant" && info.time.completed !== undefined && info.time.completed === 0
  }

  const handleRevert = () => {
    if (props.onRevert && isUser()) {
      props.onRevert(props.message.id)
    }
  }

  const containerClass = () =>
    isUser()
      ? "message-item-base bg-[var(--message-user-bg)] border-l-4 border-[var(--message-user-border)]"
      : "message-item-base assistant-message bg-[var(--message-assistant-bg)] border-l-4 border-[var(--message-assistant-border)]"
 
  const agentIdentifier = () => {
    if (isUser()) return ""
    const info = props.messageInfo
    if (!info || info.role !== "assistant") return ""
    return info.mode || ""
  }

  const modelIdentifier = () => {
    if (isUser()) return ""
    const info = props.messageInfo
    if (!info || info.role !== "assistant") return ""
    const modelID = info.modelID || ""
    const providerID = info.providerID || ""
    if (modelID && providerID) return `${providerID}/${modelID}`
    return modelID
  }
 
  return (

    <div class={containerClass()}>
      <div class="flex justify-between items-center gap-2.5 pb-0.5">
        <div class="flex flex-col">
          <Show when={isUser()}>
            <span class="font-semibold text-xs text-[var(--message-user-border)]">You</span>
          </Show>

          <Show when={!isUser()}>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--message-assistant-border)]">
              <Show when={agentIdentifier()}>{(value) => <span>Agent: {value()}</span>}</Show>
              <Show when={modelIdentifier()}>{(value) => <span>Model: {value()}</span>}</Show>
            </div>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <Show when={isUser() && props.onRevert}>
            <button
              class="bg-transparent border border-[var(--border-base)] text-[var(--text-muted)] cursor-pointer px-3 py-0.5 rounded text-xs font-semibold leading-none transition-all duration-200 flex items-center justify-center h-6 hover:bg-[var(--surface-hover)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] active:scale-95"
              onClick={handleRevert}
              title="Revert to this message"
              aria-label="Revert to this message"
            >
              Revert to
            </button>
          </Show>
          <Show when={isUser() && props.onFork}>
            <button
              class="bg-transparent border border-[var(--border-base)] text-[var(--text-muted)] cursor-pointer px-3 py-0.5 rounded text-xs font-semibold leading-none transition-all duration-200 flex items-center justify-center h-6 hover:bg-[var(--surface-hover)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] active:scale-95"
              onClick={() => props.onFork?.(props.message.id)}
              title="Fork from this message"
              aria-label="Fork from this message"
            >
              Fork
            </button>
          </Show>
          <span class="text-[11px] text-[var(--text-muted)]">{timestamp()}</span>
        </div>
      </div>

      <div class="pt-1 whitespace-pre-wrap break-words leading-[1.1]">

        <Show when={props.isQueued && isUser()}>
          <div class="message-queued-badge">QUEUED</div>
        </Show>

        <Show when={errorMessage()}>
          <div class="message-error-block">⚠️ {errorMessage()}</div>
        </Show>

        <Show when={isGenerating()}>
          <div class="message-generating">
            <span class="generating-spinner">⏳</span> Generating...
          </div>
        </Show>

        <For each={messageParts()}>{(part) => (
          <MessagePart
            part={part}
            messageType={props.message.type}
            instanceId={props.instanceId}
            sessionId={props.sessionId}
          />
        )}</For>
      </div>

      <Show when={props.message.status === "sending"}>
        <div class="message-sending">
          <span class="generating-spinner">●</span> Sending...
        </div>
      </Show>

      <Show when={props.message.status === "error"}>
        <div class="message-error">⚠ Message failed to send</div>
      </Show>
    </div>
  )
}
