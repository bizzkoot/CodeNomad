# Task 007: Message Display

## Goal

Create the message display component that renders user and assistant messages in a scrollable stream, showing message content, tool calls, and streaming states.

> Note: This legacy task predates `message-stream-v2` and the normalized message store; the new implementation lives under `packages/ui/src/components/message-stream-v2.tsx`.

## Prerequisites

- Task 006 completed (Tab navigation in place)
- Understanding of message part structure from OpenCode SDK
- Familiarity with markdown rendering
- Knowledge of SolidJS For/Show components

## Acceptance Criteria

- [ ] Messages render in chronological order
- [ ] User messages display with correct styling
- [ ] Assistant messages display with agent label
- [ ] Text content renders properly
- [ ] Tool calls display inline with collapse/expand
- [ ] Auto-scroll to bottom on new messages
- [ ] Manual scroll up disables auto-scroll
- [ ] "Scroll to bottom" button appears when scrolled up
- [ ] Empty state shows when no messages
- [ ] Loading state shows when fetching messages
- [ ] Timestamps display for each message
- [ ] Messages are accessible and keyboard-navigable

## Steps

### 1. Define Message Types

**src/types/message.ts:**

```typescript
export interface Message {
  id: string
  sessionId: string
  type: "user" | "assistant"
  parts: MessagePart[]
  timestamp: number
  status: "sending" | "sent" | "streaming" | "complete" | "error"
}

export type MessagePart = TextPart | ToolCallPart | ToolResultPart | ErrorPart

export interface TextPart {
  type: "text"
  text: string
}

export interface ToolCallPart {
  type: "tool_call"
  id: string
  tool: string
  input: any
  status: "pending" | "running" | "success" | "error"
}

export interface ToolResultPart {
  type: "tool_result"
  toolCallId: string
  output: any
  error?: string
}

export interface ErrorPart {
  type: "error"
  message: string
}
```

### 2. Create Message Stream Component

**src/components/message-stream.tsx:**

```typescript
import { For, Show, createSignal, onMount, onCleanup } from "solid-js"
import { Message } from "../types/message"
import MessageItem from "./message-item"

interface MessageStreamProps {
  sessionId: string
  messages: Message[]
  loading?: boolean
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

  onMount(() => {
    if (autoScroll()) {
      scrollToBottom()
    }
  })

  // Auto-scroll when new messages arrive
  const messagesLength = () => props.messages.length
  createEffect(() => {
    messagesLength() // Track changes
    if (autoScroll()) {
      setTimeout(scrollToBottom, 0)
    }
  })

  return (
    <div class="message-stream-container">
      <div
        ref={containerRef}
        class="message-stream"
        onScroll={handleScroll}
      >
        <Show when={!props.loading && props.messages.length === 0}>
          <div class="empty-state">
            <div class="empty-state-content">
              <h3>Start a conversation</h3>
              <p>Type a message below or try:</p>
              <ul>
                <li><code>/init-project</code></li>
                <li>Ask about your codebase</li>
                <li>Attach files with <code>@</code></li>
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

        <For each={props.messages}>
          {(message) => (
            <MessageItem message={message} />
          )}
        </For>
      </div>

      <Show when={showScrollButton()}>
        <button
          class="scroll-to-bottom"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          ↓
        </button>
      </Show>
    </div>
  )
}
```

### 3. Create Message Item Component

**src/components/message-item.tsx:**

```typescript
import { For, Show } from "solid-js"
import { Message } from "../types/message"
import MessagePart from "./message-part"

interface MessageItemProps {
  message: Message
}

export default function MessageItem(props: MessageItemProps) {
  const isUser = () => props.message.type === "user"
  const timestamp = () => {
    const date = new Date(props.message.timestamp)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div class={`message-item ${isUser() ? "user" : "assistant"}`}>
      <div class="message-header">
        <span class="message-sender">
          {isUser() ? "You" : "Assistant"}
        </span>
        <span class="message-timestamp">{timestamp()}</span>
      </div>

      <div class="message-content">
        <For each={props.message.parts}>
          {(part) => <MessagePart part={part} />}
        </For>
      </div>

      <Show when={props.message.status === "error"}>
        <div class="message-error">
          ⚠ Message failed to send
        </div>
      </Show>
    </div>
  )
}
```

### 4. Create Message Part Component

**src/components/message-part.tsx:**

```typescript
import { Show, Match, Switch } from "solid-js"
import { MessagePart as MessagePartType } from "../types/message"
import ToolCall from "./tool-call"

interface MessagePartProps {
  part: MessagePartType
}

export default function MessagePart(props: MessagePartProps) {
  return (
    <Switch>
      <Match when={props.part.type === "text"}>
        <div class="message-text">
          {(props.part as any).text}
        </div>
      </Match>

      <Match when={props.part.type === "tool_call"}>
        <ToolCall toolCall={props.part as any} />
      </Match>

      <Match when={props.part.type === "error"}>
        <div class="message-error-part">
          ⚠ {(props.part as any).message}
        </div>
      </Match>
    </Switch>
  )
}
```

### 5. Create Tool Call Component

**src/components/tool-call.tsx:**

```typescript
import { createSignal, Show } from "solid-js"
import { ToolCallPart } from "../types/message"

interface ToolCallProps {
  toolCall: ToolCallPart
}

export default function ToolCall(props: ToolCallProps) {
  const [expanded, setExpanded] = createSignal(false)

  const statusIcon = () => {
    switch (props.toolCall.status) {
      case "pending":
        return "⏳"
      case "running":
        return "⏳"
      case "success":
        return "✓"
      case "error":
        return "✗"
      default:
        return ""
    }
  }

  const statusClass = () => {
    return `tool-call-status-${props.toolCall.status}`
  }

  function toggleExpanded() {
    setExpanded(!expanded())
  }

  function formatToolSummary() {
    // Create a brief summary of the tool call
    const { tool, input } = props.toolCall

    switch (tool) {
      case "bash":
        return `bash: ${input.command}`
      case "edit":
        return `edit ${input.filePath}`
      case "read":
        return `read ${input.filePath}`
      case "write":
        return `write ${input.filePath}`
      default:
        return `${tool}`
    }
  }

  return (
    <div class={`tool-call ${statusClass()}`}>
      <button
        class="tool-call-header"
        onClick={toggleExpanded}
        aria-expanded={expanded()}
      >
        <span class="tool-call-icon">
          {expanded() ? "▼" : "▶"}
        </span>
        <span class="tool-call-summary">
          {formatToolSummary()}
        </span>
        <span class="tool-call-status">
          {statusIcon()}
        </span>
      </button>

      <Show when={expanded()}>
        <div class="tool-call-details">
          <div class="tool-call-section">
            <h4>Input:</h4>
            <pre><code>{JSON.stringify(props.toolCall.input, null, 2)}</code></pre>
          </div>

          <Show when={props.toolCall.status === "success" || props.toolCall.status === "error"}>
            <div class="tool-call-section">
              <h4>Output:</h4>
              <pre><code>{formatToolOutput()}</code></pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )

  function formatToolOutput() {
    // This will be enhanced in later tasks
    // For now, just stringify
    return "Output will be displayed here"
  }
}
```

### 6. Add Message Store Integration

**src/stores/sessions.ts updates:**

```typescript
interface Session {
  // ... existing fields
  messages: Message[]
}

async function loadMessages(instanceId: string, sessionId: string) {
  const instance = getInstance(instanceId)
  if (!instance) return

  try {
    // Fetch messages from SDK
    const response = await instance.client.session.getMessages(sessionId)

    // Update session with messages
    const session = instance.sessions.get(sessionId)
    if (session) {
      session.messages = response.messages.map(transformMessage)
    }
  } catch (error) {
    console.error("Failed to load messages:", error)
    throw error
  }
}

function transformMessage(apiMessage: any): Message {
  return {
    id: apiMessage.id,
    sessionId: apiMessage.sessionId,
    type: apiMessage.type,
    parts: apiMessage.parts || [],
    timestamp: apiMessage.timestamp || Date.now(),
    status: "complete",
  }
}
```

### 7. Update App to Show Messages

**src/App.tsx updates:**

```tsx
<Show when={instance().activeSessionId !== "logs"}>
  {() => {
    const session = instance().sessions.get(instance().activeSessionId!)

    return (
      <Show when={session} fallback={<div>Session not found</div>}>
        {(s) => <MessageStream sessionId={s().id} messages={s().messages} loading={false} />}
      </Show>
    )
  }}
</Show>
```

### 8. Add Styling

**src/components/message-stream.css:**

```css
.message-stream-container {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.message-stream {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  max-width: 85%;
}

.message-item.user {
  align-self: flex-end;
  background-color: var(--user-message-bg);
}

.message-item.assistant {
  align-self: flex-start;
  background-color: var(--assistant-message-bg);
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.message-sender {
  font-weight: 600;
  font-size: 14px;
}

.message-timestamp {
  font-size: 12px;
  color: var(--text-muted);
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-text {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.tool-call {
  margin: 8px 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.tool-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  width: 100%;
  background-color: var(--secondary-bg);
  border: none;
  cursor: pointer;
  font-family: monospace;
  font-size: 13px;
}

.tool-call-header:hover {
  background-color: var(--hover-bg);
}

.tool-call-icon {
  font-size: 10px;
}

.tool-call-summary {
  flex: 1;
  text-align: left;
}

.tool-call-status {
  font-size: 14px;
}

.tool-call-status-success {
  border-left: 3px solid var(--success-color);
}

.tool-call-status-error {
  border-left: 3px solid var(--error-color);
}

.tool-call-status-running {
  border-left: 3px solid var(--warning-color);
}

.tool-call-details {
  padding: 12px;
  background-color: var(--code-bg);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-call-section h4 {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-muted);
}

.tool-call-section pre {
  margin: 0;
  padding: 8px;
  background-color: var(--background);
  border-radius: 4px;
  overflow-x: auto;
}

.tool-call-section code {
  font-family: monospace;
  font-size: 12px;
  line-height: 1.4;
}

.scroll-to-bottom {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: var(--accent-color);
  color: white;
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 150ms ease;
}

.scroll-to-bottom:hover {
  transform: scale(1.1);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
}

.empty-state-content {
  text-align: center;
  max-width: 400px;
}

.empty-state-content h3 {
  font-size: 18px;
  margin-bottom: 12px;
}

.empty-state-content p {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.empty-state-content ul {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state-content li {
  font-size: 14px;
  color: var(--text-muted);
}

.empty-state-content code {
  background-color: var(--code-bg);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 13px;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

### 9. Add CSS Variables

**src/index.css updates:**

```css
:root {
  /* Message colors */
  --user-message-bg: #e3f2fd;
  --assistant-message-bg: #f5f5f5;

  /* Status colors */
  --success-color: #4caf50;
  --error-color: #f44336;
  --warning-color: #ff9800;

  /* Code colors */
  --code-bg: #f8f8f8;
}

[data-theme="dark"] {
  --user-message-bg: #1e3a5f;
  --assistant-message-bg: #2a2a2a;
  --code-bg: #1a1a1a;
}
```

### 10. Load Messages on Session Switch

**src/hooks/use-session.ts:**

```typescript
import { createEffect } from "solid-js"

export function useSession(instanceId: string, sessionId: string) {
  createEffect(() => {
    // Load messages when session becomes active
    if (sessionId && sessionId !== "logs") {
      loadMessages(instanceId, sessionId).catch(console.error)
    }
  })
}
```

**Use in App.tsx:**

```tsx
<Show when={session}>
  {(s) => {
    useSession(instance().id, s().id)

    return <MessageStream sessionId={s().id} messages={s().messages} loading={false} />
  }}
</Show>
```

### 11. Add Accessibility

**ARIA attributes:**

```tsx
<div
  class="message-stream"
  role="log"
  aria-live="polite"
  aria-atomic="false"
  aria-label="Message history"
>
  {/* Messages */}
</div>

<div
  class="message-item"
  role="article"
  aria-label={`${isUser() ? "Your" : "Assistant"} message at ${timestamp()}`}
>
  {/* Message content */}
</div>
```

**Keyboard navigation:**

- Messages should be accessible via Tab key
- Tool calls can be expanded with Enter/Space
- Screen readers announce new messages

### 12. Handle Long Messages

**Text wrapping:**

```css
.message-text {
  overflow-wrap: break-word;
  word-wrap: break-word;
  hyphens: auto;
}
```

**Code blocks (for now, just basic):**

```css
.message-text pre {
  overflow-x: auto;
  padding: 8px;
  background-color: var(--code-bg);
  border-radius: 4px;
}
```

## Testing Checklist

**Manual Tests:**

1. Empty session shows empty state
2. Messages load when switching sessions
3. User messages appear on right
4. Assistant messages appear on left
5. Timestamps display correctly
6. Tool calls appear inline
7. Tool calls expand/collapse on click
8. Auto-scroll works for new messages
9. Manual scroll up disables auto-scroll
10. Scroll to bottom button appears/works
11. Long messages wrap correctly
12. Multiple messages display properly
13. Messages are keyboard accessible

**Edge Cases:**

- Session with 1 message
- Session with 100+ messages
- Messages with very long text
- Messages with no parts
- Tool calls with large output
- Rapid message updates
- Switching sessions while loading

## Dependencies

- **Blocks:** Task 008 (SSE will update these messages in real-time)
- **Blocked by:** Task 006 (needs tab structure)

## Estimated Time

4-5 hours

## Notes

- Keep styling simple for now - markdown rendering comes in Task 012
- Tool output formatting will be enhanced in Task 010
- Focus on basic text display and structure
- Don't optimize for virtual scrolling yet (MVP principle)
- Message actions (copy, edit, etc.) come in Task 026
- This is the foundation for real-time updates in Task 008
