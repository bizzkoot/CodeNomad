/**
 * Search keyboard shortcuts registration
 * 
 * Registers keyboard shortcuts for search functionality:
 * - Cmd+F / Ctrl+F: Open search panel
 * - Enter: Navigate to next match
 * - Shift+Enter: Navigate to previous match
 * - Esc: Close search panel
 * - ArrowDown: Navigate to next match
 * - ArrowUp: Navigate to previous match
 * 
 * @module search/shortcuts
 */

import { keyboardRegistry } from "../keyboard-registry"
import { openSearch, closeSearch, navigateNext, navigatePrevious, isOpen } from "../../stores/search-store"

/**
 * Check if running on macOS
 */
function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

/**
 * Register all search-related keyboard shortcuts
 * 
 * Call this once during app initialization to register all shortcuts
 */
export function registerSearchShortcuts() {
  // Open search: Cmd+F (Mac) or Ctrl+F (other)
  keyboardRegistry.register({
    id: "search-open",
    key: "f",
    modifiers: {
      ctrl: !isMac(),
      meta: isMac()
    },
    handler: handleOpenSearch,
    description: "Open search panel",
    context: "global"
  })

  // Navigate to next match: Enter (when search is open)
  keyboardRegistry.register({
    id: "search-next-enter",
    key: "Enter",
    modifiers: {},
    handler: handleEnterKey,
    description: "Navigate to next match",
    context: "global",
    condition: isSearchOpen
  })

  // Navigate to previous match: Shift+Enter (when search is open)
  keyboardRegistry.register({
    id: "search-previous-enter",
    key: "Enter",
    modifiers: { shift: true },
    handler: handleShiftEnter,
    description: "Navigate to previous match",
    context: "global",
    condition: isSearchOpen
  })

  // Close search: Esc (when search is open)
  keyboardRegistry.register({
    id: "search-close",
    key: "Escape",
    modifiers: {},
    handler: handleCloseSearch,
    description: "Close search panel",
    context: "global",
    condition: isSearchOpen
  })

  // Navigate to next match: ArrowDown (when search is open)
  keyboardRegistry.register({
    id: "search-next-arrow",
    key: "ArrowDown",
    modifiers: {},
    handler: navigateNext,
    description: "Navigate to next match",
    context: "global",
    condition: isSearchOpen
  })

  // Navigate to previous match: ArrowUp (when search is open)
  keyboardRegistry.register({
    id: "search-previous-arrow",
    key: "ArrowUp",
    modifiers: {},
    handler: navigatePrevious,
    description: "Navigate to previous match",
    context: "global",
    condition: isSearchOpen
  })

  // Alternative shortcuts for navigation (Cmd+G / Cmd+Shift+G)
  if (isMac()) {
    keyboardRegistry.register({
      id: "search-next-cmd-g",
      key: "g",
      modifiers: { meta: true },
      handler: navigateNext,
      description: "Navigate to next match (alternative)",
      context: "global",
      condition: isSearchOpen
    })

    keyboardRegistry.register({
      id: "search-previous-cmd-g",
      key: "g",
      modifiers: { meta: true, shift: true },
      handler: navigatePrevious,
      description: "Navigate to previous match (alternative)",
      context: "global",
      condition: isSearchOpen
    })
  } else {
    keyboardRegistry.register({
      id: "search-next-ctrl-g",
      key: "g",
      modifiers: { ctrl: true },
      handler: navigateNext,
      description: "Navigate to next match (alternative)",
      context: "global",
      condition: isSearchOpen
    })

    keyboardRegistry.register({
      id: "search-previous-ctrl-g",
      key: "g",
      modifiers: { ctrl: true, shift: true },
      handler: navigatePrevious,
      description: "Navigate to previous match (alternative)",
      context: "global",
      condition: isSearchOpen
    })
  }
}

/**
 * Condition to check if search panel is open
 */
function isSearchOpen(): boolean {
  return isOpen()
}

/**
 * Handle opening search panel
 * Scopes to currently active session by default
 */
function handleOpenSearch() {
  // Use dynamic import to avoid circular dependency
  // At the time of initialization, we'll just open without scope
  // The search panel component will set the scope when it mounts
  openSearch()
}

/**
 * Handle Enter key (execute search)
 * This is handled by the search panel component
 * We just navigate to next match if search already executed
 */
function handleEnterKey() {
  navigateNext()
}

/**
 * Handle Shift+Enter key
 * Navigate to previous match
 */
function handleShiftEnter() {
  navigatePrevious()
}

/**
 * Handle closing search panel
 */
function handleCloseSearch() {
  closeSearch()
}

/**
 * Unregister all search shortcuts
 * Useful for cleanup or unregistering
 */
export function unregisterSearchShortcuts() {
  const shortcutsToUnregister = [
    "search-open",
    "search-next-enter",
    "search-previous-enter",
    "search-close",
    "search-next-arrow",
    "search-previous-arrow",
    "search-next-cmd-g",
    "search-previous-cmd-g",
    "search-next-ctrl-g",
    "search-previous-ctrl-g"
  ].filter(id => keyboardRegistry.get(id))

  shortcutsToUnregister.forEach(id => keyboardRegistry.unregister(id))
}
