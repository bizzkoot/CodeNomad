import { Component, For } from "solid-js"
import { formatShortcut, isMac } from "../lib/keyboard-utils"
import type { KeyboardShortcut } from "../lib/keyboard-registry"
import Kbd from "./kbd"
import HintRow from "./hint-row"

const KeyboardHint: Component<{
  shortcuts: KeyboardShortcut[]
  separator?: string
  showDescription?: boolean
}> = (props) => {
  function buildShortcutString(shortcut: KeyboardShortcut): string {
    const parts: string[] = []

    if (shortcut.modifiers.ctrl || shortcut.modifiers.meta) {
      parts.push("cmd")
    }
    if (shortcut.modifiers.shift) {
      parts.push("shift")
    }
    if (shortcut.modifiers.alt) {
      parts.push("alt")
    }
    parts.push(shortcut.key)

    return parts.join("+")
  }

  return (
    <HintRow>
      <For each={props.shortcuts}>
        {(shortcut, i) => (
          <>
            {i() > 0 && <span class="mx-1">{props.separator || "•"}</span>}
            {props.showDescription !== false && <span class="mr-1">{shortcut.description}</span>}
            <Kbd shortcut={buildShortcutString(shortcut)} />
          </>
        )}
      </For>
    </HintRow>
  )
}

export default KeyboardHint
