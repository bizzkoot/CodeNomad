/**
 * Search Panel Component
 * 
 * Floating panel for searching through chat messages.
 * Features:
 * - Search query input
 * - Navigation buttons (Previous | Next)
 * - Match counter (e.g., "3/15")
 * - Options dropdown (case-sensitive, whole-word, etc.)
 * - Keyboard shortcuts (Enter, Shift+Enter, Esc, Arrow keys)
 * 
 * @module search-panel
 */

import { createEffect, createSignal, onMount, onCleanup, Show, For } from "solid-js"
import type { InstanceMessageStore } from "../stores/message-v2/instance-store"
import { Search, ChevronUp, ChevronDown, Settings, X } from "lucide-solid"
import type { SearchOptions } from "../types/search"
import { 
  query, 
  setQueryInput, 
  isOpen, 
  matches, 
  currentIndex, 
  options,
  executeSearchOnEnter, 
  updateOptions as updateSearchOptions, 
  closeSearch, 
  navigateNext, 
  navigatePrevious,
  instanceId,
  sessionId as searchSessionId,
  setInstanceId,
  setSessionId,
} from "../stores/search-store"

interface SearchPanelProps {
  store: () => InstanceMessageStore
  instanceId: string
  sessionId: () => string | null
}

export default function SearchPanel(props: SearchPanelProps) {
  const [inputRef, setInputRef] = createSignal<HTMLInputElement | undefined>()
  const [showOptions, setShowOptions] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  // Get match count and current position
  const matchCount = () => matches().length
  const currentPosition = () => matchCount() > 0 ? currentIndex() + 1 : 0

  // Format match counter display
  function formatCounter(): string {
    const total = matchCount()
    const current = currentPosition()

    if (total === 0) return "0/0"
    if (total >= 100) return `${current}/100+`
    return `${current}/${total}`
  }

  // Set search scope when panel opens or session changes
  createEffect(() => {
    if (!isOpen()) return

    const currentSessionId = props.sessionId()
    
    // Set instance and session scope in the search store
    setInstanceId(props.instanceId)
    setSessionId(currentSessionId || null)
  })

  // Focus input when panel opens, close options when panel closes
  createEffect(() => {
    if (isOpen()) {
      const input = inputRef()
      if (input) {
        requestAnimationFrame(() => {
          input.focus()
          input.select()
        })
      }
    } else {
      // Close options dropdown when panel closes
      setShowOptions(false)
    }
  })

  // Handle Enter key to execute search or navigate
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      // If Shift key is pressed, navigate to previous match
      if (e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        if (matchCount() > 0) {
          navigatePrevious()
        }
        return
      }

      // If search has results, navigate to next match
      // Otherwise, execute the search
      if (matchCount() > 0) {
        e.preventDefault()
        e.stopPropagation()
        navigateNext()
      } else {
        try {
          setError(null)
          executeSearchOnEnter(props.store())
        } catch (err) {
          setError(err instanceof Error ? err.message : "Search error occurred")
        }
      }
    } else if (e.key === "Escape") {
      // Close search on Esc
      closeSearch()
    }
  }

  // Handle query input change
  function handleQueryChange(e: Event) {
    const target = e.target as HTMLInputElement
    setQueryInput(target.value)
    setError(null)
  }

  // Handle navigation clicks
  function handlePreviousClick() {
    navigatePrevious()
    // Return focus to input
    inputRef()?.focus()
  }

  function handleNextClick() {
    navigateNext()
    // Return focus to input
    inputRef()?.focus()
  }

  // Handle close button
  function handleCloseClick() {
    closeSearch()
  }

  // Handle option toggle
  function handleOptionToggle<T extends keyof SearchOptions>(option: T, value: boolean) {
    const newOptions: Record<string, boolean> = {}
    newOptions[option as string] = value
    updateSearchOptions(newOptions as Partial<SearchOptions>, props.store())
    // Return focus to input
    inputRef()?.focus()
  }

  // Options dropdown items
  const optionItems = () => [
    {
      id: "caseSensitive",
      label: "Case Sensitive",
      checked: () => options().caseSensitive,
      onChange: (checked: boolean) => handleOptionToggle("caseSensitive", checked)
    },
    {
      id: "wholeWord",
      label: "Whole Word",
      checked: () => options().wholeWord,
      onChange: (checked: boolean) => handleOptionToggle("wholeWord", checked)
    },
    {
      id: "includeToolOutputs",
      label: "Include Tool Outputs",
      checked: () => options().includeToolOutputs,
      onChange: (checked: boolean) => handleOptionToggle("includeToolOutputs", checked)
    },
    {
      id: "includeReasoning",
      label: "Include Reasoning Blocks",
      checked: () => options().includeReasoning,
      onChange: (checked: boolean) => handleOptionToggle("includeReasoning", checked)
    }
  ]

  // Close options dropdown when clicking outside
  createEffect(() => {
    if (!showOptions()) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const optionsPanel = document.querySelector(".search-options-panel")
      const optionsButton = document.querySelector(".search-options-button")
      
      if (optionsPanel && !optionsPanel.contains(target) && !optionsButton?.contains(target)) {
        setShowOptions(false)
      }
    }

    document.addEventListener("click", handleClickOutside)
    onCleanup(() => {
      document.removeEventListener("click", handleClickOutside)
    })
  })

  return (
    <Show when={isOpen()}>
      <div class="search-panel-container">
        <div class="search-panel">
          {/* Left side: Search icon and input */}
          <div class="search-panel-input-group">
            <Search class="search-panel-icon" />
            <input
              ref={setInputRef}
              type="text"
              class="search-panel-input"
              placeholder="Search messages..."
              value={query()}
              onInput={handleQueryChange}
              onKeyDown={handleKeyDown}
              aria-label="Search messages"
            />
            <Show when={query()}>
              <button
                type="button"
                class="search-panel-clear-button"
                onClick={() => setQueryInput("")}
                aria-label="Clear search"
              >
                <X class="w-3 h-3" />
              </button>
            </Show>
          </div>

          {/* Middle: Nav buttons and match counter */}
          <div class="search-panel-nav-group">
            <button
              type="button"
              class="search-panel-nav-button"
              onClick={handlePreviousClick}
              disabled={matchCount() === 0}
              aria-label="Previous match"
              title="Previous match (Shift+Enter or ArrowUp)"
            >
              <ChevronUp class="w-4 h-4" />
            </button>

            <div class="search-panel-counter">
              {formatCounter()}
            </div>

            <button
              type="button"
              class="search-panel-nav-button"
              onClick={handleNextClick}
              disabled={matchCount() === 0}
              aria-label="Next match"
              title="Next match (Enter or ArrowDown)"
            >
              <ChevronDown class="w-4 h-4" />
            </button>
          </div>

          {/* Right side: Options and close */}
          <div class="search-panel-actions-group">
            <button
              type="button"
              class="search-panel-options-button search-options-button"
              onClick={() => setShowOptions(!showOptions())}
              aria-expanded={showOptions()}
              aria-label="Search options"
              title="Search options"
            >
              <Settings class="w-4 h-4" />
            </button>

            <button
              type="button"
              class="search-panel-close-button"
              onClick={handleCloseClick}
              aria-label="Close search"
              title="Close search (Esc)"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Options dropdown */}
        <Show when={showOptions()}>
          <div class="search-options-panel">
            <For each={optionItems()}>
              {(item) => (
                <label class="search-option-item">
                  <input
                    type="checkbox"
                    class="search-option-checkbox"
                    checked={item.checked()}
                    onChange={(e) => item.onChange((e.target as HTMLInputElement).checked)}
                  />
                  <span class="search-option-label">{item.label}</span>
                </label>
              )}
            </For>
          </div>
        </Show>

        {/* Error message */}
        <Show when={error()}>
          <div class="search-panel-error">
            {error()}
          </div>
        </Show>
      </div>
    </Show>
  )
}
