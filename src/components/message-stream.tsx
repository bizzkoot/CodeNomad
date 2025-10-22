import { For, Show, createSignal, createEffect, createMemo } from "solid-js"
import type { Message } from "../types/message"
import MessageItem from "./message-item"
import ToolCall from "./tool-call"

interface MessageStreamProps {
  sessionId: string
  messages: Message[]
  messagesInfo?: Map<string, any>
  loading?: boolean
}

interface DisplayItem {
  type: "message" | "tool"
  data: any
  messageInfo?: any
}

export default function MessageStream(props: MessageStreamProps) {
  let containerRef: HTMLDivElement | undefined
  const [autoScroll, setAutoScroll] = createSignal(true)
  const [showScrollButton, setShowScrollButton] = createSignal(false)

  function scrollToBottom() {
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight
      setAutoScroll(true)
      setShowScrollButton(false)
    }
  }

  function handleScroll() {
    if (!containerRef) return

    const { scrollTop, scrollHeight, clientHeight } = containerRef
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50

    setAutoScroll(isAtBottom)
    setShowScrollButton(!isAtBottom)
  }

  const displayItems = createMemo(() => {
    const items: DisplayItem[] = []

    for (const message of props.messages) {
      const messageInfo = props.messagesInfo?.get(message.id)
      const textParts = message.parts.filter((p) => p.type === "text" && !p.synthetic)
      const toolParts = message.parts.filter((p) => p.type === "tool")
      const reasoningParts = message.parts.filter((p) => p.type === "reasoning")

      if (textParts.length > 0 || reasoningParts.length > 0 || messageInfo?.error) {
        items.push({
          type: "message",
          data: {
            ...message,
            parts: [...textParts, ...reasoningParts],
          },
          messageInfo,
        })
      }

      for (const toolPart of toolParts) {
        items.push({
          type: "tool",
          data: toolPart,
          messageInfo,
        })
      }
    }

    return items
  })

  const itemsLength = () => displayItems().length
  createEffect(() => {
    itemsLength()
    if (autoScroll()) {
      setTimeout(scrollToBottom, 0)
    }
  })

  return (
    <div class="message-stream-container">
      <div ref={containerRef} class="message-stream" onScroll={handleScroll}>
        <Show when={!props.loading && displayItems().length === 0}>
          <div class="empty-state">
            <div class="empty-state-content">
              <h3>Start a conversation</h3>
              <p>Type a message below or try:</p>
              <ul>
                <li>
                  <code>/init-project</code>
                </li>
                <li>Ask about your codebase</li>
                <li>
                  Attach files with <code>@</code>
                </li>
              </ul>
            </div>
          </div>
        </Show>

        <Show when={props.loading}>
          <div class="loading-state">
            <div class="spinner" />
            <p>Loading messages...</p>
          </div>
        </Show>

        <For each={displayItems()}>
          {(item) => (
            <Show
              when={item.type === "message"}
              fallback={
                <div class="tool-call-message">
                  <div class="tool-call-header-label">
                    <span class="tool-call-icon">🔧</span>
                    <span>Tool Call</span>
                    <span class="tool-name">{item.data?.tool || "unknown"}</span>
                  </div>
                  <ToolCall toolCall={item.data} />
                </div>
              }
            >
              <MessageItem message={item.data} messageInfo={item.messageInfo} />
            </Show>
          )}
        </For>
      </div>

      <Show when={showScrollButton()}>
        <button class="scroll-to-bottom" onClick={scrollToBottom} aria-label="Scroll to bottom">
          ↓
        </button>
      </Show>
    </div>
  )
}
