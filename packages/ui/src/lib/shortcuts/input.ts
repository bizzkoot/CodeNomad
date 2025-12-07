import { keyboardRegistry } from "../keyboard-registry"

export function registerInputShortcuts(clearInput: () => void, focusInput: () => void) {
  const isMac = () => navigator.platform.toLowerCase().includes("mac")

  keyboardRegistry.register({
    id: "clear-input",
    key: "k",
    modifiers: { ctrl: !isMac(), meta: isMac() },
    handler: clearInput,
    description: "clear input",
    context: "global",
  })

  keyboardRegistry.register({
    id: "focus-input",
    key: "p",
    modifiers: { ctrl: !isMac(), meta: isMac() },
    handler: focusInput,
    description: "focus input",
    context: "global",
  })
}
