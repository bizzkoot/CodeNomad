import { Component, JSX, For } from "solid-js"
import { isMac } from "../lib/keyboard-utils"

interface KbdProps {
  children?: JSX.Element
  shortcut?: string
  class?: string
}

const Kbd: Component<KbdProps> = (props) => {
  const parts = () => {
    if (props.children) return [{ text: props.children, isModifier: false }]
    if (!props.shortcut) return []

    const result: { text: string | JSX.Element; isModifier: boolean }[] = []
    const shortcut = props.shortcut.toLowerCase()
    const tokens = shortcut.split("+")

    tokens.forEach((token, i) => {
      const trimmed = token.trim()

      if (trimmed === "cmd" || trimmed === "command") {
        result.push({ text: isMac() ? "Cmd" : "Ctrl", isModifier: false })
      } else if (trimmed === "shift") {
        result.push({ text: "Shift", isModifier: false })
      } else if (trimmed === "alt" || trimmed === "option") {
        result.push({ text: isMac() ? "Option" : "Alt", isModifier: false })
      } else if (trimmed === "ctrl") {
        result.push({ text: "Ctrl", isModifier: false })
      } else {
        result.push({ text: trimmed.toUpperCase(), isModifier: false })
      }
    })

    return result
  }

  return (
    <kbd class={`kbd ${props.class || ""}`}>
      <For each={parts()}>
        {(part, index) => (
          <>
            {index() > 0 && <span class="kbd-separator">+</span>}
            <span>{part.text}</span>
          </>
        )}
      </For>
    </kbd>
  )
}

export default Kbd
