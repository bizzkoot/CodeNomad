import { Show, Match, Switch } from "solid-js"
import ToolCall from "./tool-call"

interface MessagePartProps {
  part: any
}

export default function MessagePart(props: MessagePartProps) {
  const partType = () => props.part?.type || ""

  return (
    <Switch>
      <Match when={partType() === "text"}>
        <Show when={!props.part.synthetic && props.part.text}>
          <div class="message-text">{props.part.text}</div>
        </Show>
      </Match>

      <Match when={partType() === "tool"}>
        <ToolCall toolCall={props.part} />
      </Match>

      <Match when={partType() === "error"}>
        <div class="message-error-part">⚠ {props.part.message}</div>
      </Match>

      <Match when={partType() === "reasoning"}>
        <div class="message-reasoning">
          <details>
            <summary class="text-sm text-gray-500 cursor-pointer">Reasoning</summary>
            <div class="message-text mt-2">{props.part.text || ""}</div>
          </details>
        </div>
      </Match>
    </Switch>
  )
}
