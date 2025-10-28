import { Component, createSignal, For, Show, onMount, createEffect } from "solid-js"
import { Dialog } from "@kobalte/core/dialog"
import type { Command } from "../lib/commands"
import Kbd from "./kbd"

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  commands: Command[]
  onExecute: (commandId: string) => void
}

function buildShortcutString(shortcut: Command["shortcut"]): string {
  if (!shortcut) return ""

  const parts: string[] = []

  if (shortcut.meta || shortcut.ctrl) parts.push("cmd")
  if (shortcut.shift) parts.push("shift")
  if (shortcut.alt) parts.push("alt")
  parts.push(shortcut.key)

  return parts.join("+")
}

const CommandPalette: Component<CommandPaletteProps> = (props) => {
  const [query, setQuery] = createSignal("")
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  let inputRef: HTMLInputElement | undefined
  let listRef: HTMLDivElement | undefined

  const filteredCommands = () => {
    const q = query().toLowerCase()
    if (!q) return props.commands

    return props.commands.filter((cmd) => {
      const label = typeof cmd.label === "function" ? cmd.label() : cmd.label
      const labelMatch = label.toLowerCase().includes(q)
      const descMatch = cmd.description.toLowerCase().includes(q)
      const keywordMatch = cmd.keywords?.some((k) => k.toLowerCase().includes(q))
      const categoryMatch = cmd.category?.toLowerCase().includes(q)
      return labelMatch || descMatch || keywordMatch || categoryMatch
    })
  }

  const groupedCommands = () => {
    const filtered = filteredCommands()
    const groups = new Map<string, Command[]>()

    for (const cmd of filtered) {
      const category = cmd.category || "Other"
      if (!groups.has(category)) {
        groups.set(category, [])
      }
      groups.get(category)!.push(cmd)
    }

    const categoryOrder = ["Instance", "Session", "Agent & Model", "Input & Focus", "System", "Other"]
    const sorted = new Map<string, Command[]>()
    for (const cat of categoryOrder) {
      if (groups.has(cat)) {
        sorted.set(cat, groups.get(cat)!)
      }
    }
    for (const [cat, cmds] of groups) {
      if (!sorted.has(cat)) {
        sorted.set(cat, cmds)
      }
    }

    return sorted
  }

  createEffect(() => {
    if (props.open) {
      setQuery("")
      setSelectedIndex(0)
      setTimeout(() => inputRef?.focus(), 100)
    }
  })

  createEffect(() => {
    const max = Math.max(0, filteredCommands().length - 1)
    if (selectedIndex() > max) {
      setSelectedIndex(max)
    }
  })

  createEffect(() => {
    const index = selectedIndex()
    if (!listRef) return

    const selectedButton = listRef.querySelector(`[data-command-index="${index}"]`) as HTMLElement
    if (selectedButton) {
      selectedButton.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  })

  function handleKeyDown(e: KeyboardEvent) {
    const filtered = filteredCommands()

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const selected = filtered[selectedIndex()]
      if (selected) {
        props.onExecute(selected.id)
        props.onClose()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      props.onClose()
    }
  }

  function handleCommandClick(commandId: string) {
    props.onExecute(commandId)
    props.onClose()
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay class="modal-overlay" />
        <div class="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          <Dialog.Content
            class="modal-surface w-full max-w-2xl max-h-[60vh]"
            onKeyDown={handleKeyDown}
          >
            <Dialog.Title class="sr-only">Command Palette</Dialog.Title>
            <Dialog.Description class="sr-only">Search and execute commands</Dialog.Description>

            <div class="modal-search-container">
              <div class="flex items-center gap-3">
                <svg class="w-5 h-5 modal-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query()}
                  onInput={(e) => {
                    setQuery(e.currentTarget.value)
                    setSelectedIndex(0)
                  }}
                  placeholder="Type a command or search..."
                  class="modal-search-input"
                />
              </div>
            </div>

            <div ref={listRef} class="modal-list-container">
              <Show
                when={filteredCommands().length > 0}
                fallback={<div class="modal-empty-state">No commands found for "{query()}"</div>}
              >
                <For each={Array.from(groupedCommands().entries())}>
                  {([category, commands]) => {
                    let globalIndex = 0
                    for (const [cat, cmds] of groupedCommands().entries()) {
                      if (cat === category) break
                      globalIndex += cmds.length
                    }

                    return (
                      <div class="py-2">
                        <div class="modal-section-header">
                          {category}
                        </div>
                        <For each={commands}>
                          {(command, localIndex) => {
                            const commandIndex = globalIndex + localIndex()
                            return (
                              <button
                                type="button"
                                data-command-index={commandIndex}
                                onClick={() => handleCommandClick(command.id)}
                                class={`modal-item ${
                                  commandIndex === selectedIndex() ? "modal-item-highlight" : ""
                                }`}
                                onMouseEnter={() => setSelectedIndex(commandIndex)}
                              >
                                <div class="flex-1 min-w-0">
                                  <div class="modal-item-label">
                                    {typeof command.label === "function" ? command.label() : command.label}
                                  </div>
                                  <div class="modal-item-description">
                                    {command.description}
                                  </div>
                                </div>
                                <Show when={command.shortcut}>
                                  <div class="mt-1">
                                    <Kbd shortcut={buildShortcutString(command.shortcut)} />
                                  </div>
                                </Show>
                              </button>
                            )
                          }}
                        </For>
                      </div>
                    )
                  }}
                </For>
              </Show>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  )
}

export default CommandPalette
