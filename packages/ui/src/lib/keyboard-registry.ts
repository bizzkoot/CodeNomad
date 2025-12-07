export interface KeyboardShortcut {
  id: string
  key: string
  modifiers: {
    ctrl?: boolean
    meta?: boolean
    shift?: boolean
    alt?: boolean
  }
  handler: () => void
  description: string
  context?: "global" | "input" | "messages"
  condition?: () => boolean
}

class KeyboardRegistry {
  private shortcuts = new Map<string, KeyboardShortcut>()

  register(shortcut: KeyboardShortcut) {
    this.shortcuts.set(shortcut.id, shortcut)
  }

  unregister(id: string) {
    this.shortcuts.delete(id)
  }

  get(id: string) {
    return this.shortcuts.get(id)
  }

  findMatch(event: KeyboardEvent): KeyboardShortcut | null {
    for (const shortcut of this.shortcuts.values()) {
      if (this.matches(event, shortcut)) {
        if (shortcut.context === "input" && !this.isInputFocused()) continue
        if (shortcut.context === "messages" && this.isInputFocused()) continue

        if (shortcut.condition && !shortcut.condition()) continue

        return shortcut
      }
    }
    return null
  }

  private matches(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
    const shortcutKey = shortcut.key.toLowerCase()
    const eventKey = event.key ? event.key.toLowerCase() : ""
    const eventCode = event.code ? event.code.toLowerCase() : ""

    const keyMatch = eventKey === shortcutKey || eventCode === shortcutKey
    const ctrlMatch = event.ctrlKey === (shortcut.modifiers.ctrl ?? false)
    const metaMatch = event.metaKey === (shortcut.modifiers.meta ?? false)
    const shiftMatch = event.shiftKey === (shortcut.modifiers.shift ?? false)
    const altMatch = event.altKey === (shortcut.modifiers.alt ?? false)

    return keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch
  }

  private isInputFocused(): boolean {
    const active = document.activeElement
    return (
      active?.tagName === "TEXTAREA" ||
      active?.tagName === "INPUT" ||
      (active?.hasAttribute("contenteditable") ?? false)
    )
  }

  getByContext(context: string): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values()).filter((s) => !s.context || s.context === context)
  }
}

export const keyboardRegistry = new KeyboardRegistry()
