import { createSignal, Show } from "solid-js"

interface ToolCallProps {
  toolCall: any
}

export default function ToolCall(props: ToolCallProps) {
  const [expanded, setExpanded] = createSignal(false)

  const statusIcon = () => {
    const status = props.toolCall?.state?.status || ""
    switch (status) {
      case "pending":
        return "⏳"
      case "running":
        return "⏳"
      case "completed":
        return "✓"
      case "error":
        return "✗"
      default:
        return ""
    }
  }

  const statusClass = () => {
    const status = props.toolCall?.state?.status || "pending"
    return `tool-call-status-${status}`
  }

  function toggleExpanded() {
    setExpanded(!expanded())
  }

  function formatToolSummary() {
    const toolName = props.toolCall?.tool || ""
    const state = props.toolCall?.state || {}
    const input = state.input || {}

    if (state.title) {
      return state.title
    }

    switch (toolName) {
      case "bash":
        return `bash: ${input.command || ""}`
      case "edit":
        return `edit ${input.filePath || ""}`
      case "read":
        return `read ${input.filePath || ""}`
      case "write":
        return `write ${input.filePath || ""}`
      case "glob":
        return `glob ${input.pattern || ""}`
      case "grep":
        return `grep ${input.pattern || ""}`
      default:
        return toolName || "Unknown tool"
    }
  }

  function formatToolOutput() {
    const state = props.toolCall?.state || {}

    if (state.error) {
      return `Error: ${state.error}`
    }

    if (state.output) {
      return state.output
    }

    return "No output"
  }

  function formatOutputPreview() {
    const state = props.toolCall?.state || {}

    if (state.error) {
      return state.error
    }

    if (state.output) {
      const output = state.output
      const lines = output.split("\n")

      if (lines.length <= 10) {
        return output
      }

      const firstTenLines = lines.slice(0, 10).join("\n")
      return firstTenLines + "\n..."
    }

    return "No output"
  }

  const hasResult = () => {
    const status = props.toolCall?.state?.status || ""
    return status === "completed" || status === "error"
  }

  return (
    <div class={`tool-call ${statusClass()}`}>
      <button class="tool-call-header" onClick={toggleExpanded} aria-expanded={expanded()}>
        <span class="tool-call-icon">{expanded() ? "▼" : "▶"}</span>
        <span class="tool-call-summary">{formatToolSummary()}</span>
        <span class="tool-call-status">{statusIcon()}</span>
      </button>

      <Show when={!expanded() && hasResult()}>
        <div class="tool-call-preview">
          <span class="tool-call-preview-label">Output:</span>
          <span class="tool-call-preview-text">{formatOutputPreview()}</span>
        </div>
      </Show>

      <Show when={expanded()}>
        <div class="tool-call-details">
          <div class="tool-call-section">
            <h4>Input:</h4>
            <pre>
              <code>{JSON.stringify(props.toolCall?.state?.input || {}, null, 2)}</code>
            </pre>
          </div>

          <Show when={hasResult()}>
            <div class="tool-call-section">
              <h4>Output:</h4>
              <pre>
                <code>{formatToolOutput()}</code>
              </pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
