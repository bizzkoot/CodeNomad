import { createSignal, Show } from "solid-js"
import { Maximize2, Minimize2 } from "lucide-solid"
import { isElectronHost } from "../lib/runtime-env"

interface ExpandButtonProps {
  expandState: () => "normal" | "fifty" | "eighty" | "expanded"
  onToggleExpand: (nextState: "normal" | "fifty" | "eighty" | "expanded") => void
}

export default function ExpandButton(props: ExpandButtonProps) {
  const [clickTime, setClickTime] = createSignal<number>(0)
  const [clickTimer, setClickTimer] = createSignal<number | null>(null)
  const DOUBLE_CLICK_THRESHOLD = 300

  // Check if we're in Electron (desktop app with 3-state support)
  const isDesktopApp = isElectronHost()

  function handleClick() {
    const current = props.expandState()

    if (!isDesktopApp) {
      // Web/Mobile: Simple 2-state toggle (instant, no delay)
      if (current === "normal") {
        props.onToggleExpand("expanded")
      } else {
        props.onToggleExpand("normal")
      }
      return
    }

    // Electron: 3-state with double-click detection
    const now = Date.now()
    const lastClick = clickTime()
    const isDoubleClick = now - lastClick < DOUBLE_CLICK_THRESHOLD

    // Clear any pending single-click timer
    const timer = clickTimer()
    if (timer !== null) {
      clearTimeout(timer)
      setClickTimer(null)
    }

    if (isDoubleClick) {
      // Double click behavior - execute immediately
      if (current === "normal") {
        props.onToggleExpand("eighty")
      } else if (current === "fifty") {
        props.onToggleExpand("eighty")
      } else {
        props.onToggleExpand("fifty")
      }
      // Reset click time to prevent triple-click issues
      setClickTime(0)
    } else {
      // Single click behavior - delay to wait for potential double-click
      setClickTime(now)

      const newTimer = window.setTimeout(() => {
        const currentState = props.expandState()
        if (currentState === "normal") {
          props.onToggleExpand("fifty")
        } else {
          props.onToggleExpand("normal")
        }
        setClickTimer(null)
      }, DOUBLE_CLICK_THRESHOLD)

      setClickTimer(newTimer)
    }
  }

  const getTooltip = () => {
    // No tooltip for web/mobile - only Electron gets tooltips
    if (!isDesktopApp) {
      return undefined
    }

    const current = props.expandState()
    if (current === "normal") {
      return "Click to expand (50%) • Double-click to expand further (80%)"
    } else if (current === "fifty") {
      return "Double-click to expand to 80% • Click to minimize"
    } else {
      return "Click to minimize • Double-click to reduce to 50%"
    }
  }

  const isExpanded = () => {
    const state = props.expandState()
    return state !== "normal"
  }

  return (
    <button
      type="button"
      class={`prompt-expand-button ${isDesktopApp ? "desktop-mode" : "web-mode"}`}
      onClick={handleClick}
      disabled={false}
      aria-label="Toggle chat input height"
      data-tooltip={getTooltip()}
    >
      <Show
        when={!isExpanded()}
        fallback={<Minimize2 class="h-5 w-5" aria-hidden="true" />}
      >
        <Maximize2 class="h-5 w-5" aria-hidden="true" />
      </Show>
    </button>
  )
}
