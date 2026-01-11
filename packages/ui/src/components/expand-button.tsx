import { createSignal, Show } from "solid-js"
import { Maximize2, Minimize2 } from "lucide-solid"

interface ExpandButtonProps {
  expandState: () => "normal" | "fifty" | "eighty"
  onToggleExpand: (nextState: "normal" | "fifty" | "eighty") => void
}

export default function ExpandButton(props: ExpandButtonProps) {
  const [clickTime, setClickTime] = createSignal<number>(0)
  const DOUBLE_CLICK_THRESHOLD = 300

  function handleClick() {
    const now = Date.now()
    const lastClick = clickTime()
    const isDoubleClick = now - lastClick < DOUBLE_CLICK_THRESHOLD

    setClickTime(now)

    const current = props.expandState()

    if (isDoubleClick) {
      // Double click behavior
      if (current === "normal") {
        props.onToggleExpand("fifty")
      } else if (current === "fifty") {
        props.onToggleExpand("eighty")
      } else {
        props.onToggleExpand("normal")
      }
    } else {
      // Single click behavior
      if (current === "normal") {
        props.onToggleExpand("fifty")
      } else {
        props.onToggleExpand("normal")
      }
    }

    // Reset click timer after threshold
    setTimeout(() => setClickTime(0), DOUBLE_CLICK_THRESHOLD)
  }

  const getTooltip = () => {
    const current = props.expandState()
    if (current === "normal") {
      return "Click to expand (50%) • Double-click to expand further (80%)"
    } else if (current === "fifty") {
      return "Double-click to expand to 80% • Click to minimize"
    } else {
      return "Click to minimize • Double-click to expand to 50%"
    }
  }

  return (
    <button
      type="button"
      class="prompt-expand-button"
      onClick={handleClick}
      disabled={false}
      aria-label="Toggle chat input height"
      title={getTooltip()}
    >
      <Show
        when={props.expandState() === "normal"}
        fallback={<Minimize2 class="h-5 w-5" aria-hidden="true" />}
      >
        <Maximize2 class="h-5 w-5" aria-hidden="true" />
      </Show>
    </button>
  )
}
