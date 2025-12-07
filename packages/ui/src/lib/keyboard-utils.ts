import type { KeyboardShortcut } from "./keyboard-registry"

export const isMac = () => navigator.platform.toLowerCase().includes("mac")

export const modKey = (event?: KeyboardEvent) => {
  if (!event) return isMac() ? "metaKey" : "ctrlKey"
  return isMac() ? event.metaKey : event.ctrlKey
}

export const modKeyPressed = (event: KeyboardEvent) => {
  return isMac() ? event.metaKey : event.ctrlKey
}

export const formatShortcut = (shortcut: KeyboardShortcut): string => {
  const parts: string[] = []

  if (shortcut.modifiers.ctrl || shortcut.modifiers.meta) {
    parts.push(isMac() ? "Cmd" : "Ctrl")
  }
  if (shortcut.modifiers.shift) {
    parts.push("Shift")
  }
  if (shortcut.modifiers.alt) {
    parts.push(isMac() ? "Option" : "Alt")
  }

  parts.push(shortcut.key.toUpperCase())

  return parts.join("+")
}
