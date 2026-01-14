/**
 * Search Store - manages search state and functionality for chat sessions
 * 
 * This store handles:
 * - Search queries and options
 * - Search execution across messages
 * - Match tracking and navigation
 * - Search panel visibility
 * - Session/instance scoping
 * 
 * @module search-store
 */

import { batch, createSignal } from "solid-js"
import { findMatches } from "../lib/search-algorithm"
import { expandSectionsForMatch, waitForExpansionCompletion } from "../lib/section-expansion"
import type { SearchMatch, SearchOptions, SearchState } from "../types/search"
import type { InstanceMessageStore } from "./message-v2/instance-store"
import type { ClientPart } from "../types/message"

/**
 * Find the closest match to the current viewport position
 * Uses message anchors to estimate position without relying on mark elements
 */
function findClosestMatchToViewport(allMatches: SearchMatch[]): number {
  if (allMatches.length === 0) return -1

  // Get the scroll container
  const scrollContainer = document.querySelector('.message-stream')
  if (!scrollContainer) return 0

  const viewportCenter = scrollContainer.scrollTop + (scrollContainer.clientHeight / 2)

  let closestIndex = 0
  let closestDistance = Infinity

  // Get all message anchors in order
  const anchors = Array.from(document.querySelectorAll('[id^="message-anchor-"]'))
  
  // Create a map of message ID to anchor position
  const anchorPositions = new Map<string, number>()
  anchors.forEach(anchor => {
    const messageId = anchor.id.replace('message-anchor-', '')
    const rect = anchor.getBoundingClientRect()
    const anchorCenter = rect.top + (rect.height / 2)
    anchorPositions.set(messageId, anchorCenter)
  })

  // Find the message anchor closest to viewport center
  let closestMessageId: string | null = null
  let closestMessageDistance = Infinity

  anchorPositions.forEach((position, messageId) => {
    const distance = Math.abs(position - viewportCenter)
    if (distance < closestMessageDistance) {
      closestMessageDistance = distance
      closestMessageId = messageId
    }
  })

  if (!closestMessageId) return 0

  // Now find the first match in the closest message
  for (let i = 0; i < allMatches.length; i++) {
    const match = allMatches[i]
    if (match.messageId === closestMessageId) {
      closestIndex = i
      break
    }
  }

  return closestIndex
}

/**
 * Build CSS selector for a search match element
 */
function buildMatchSelector(match: SearchMatch): string {
  return (
    'mark[data-search-match="true"]' +
    `[data-search-message-id="${CSS.escape(match.messageId)}"]` +
    `[data-search-part-index="${match.partIndex}"]` +
    `[data-search-start="${match.startIndex}"]` +
    `[data-search-end="${match.endIndex}"]`
  )
}

const MAX_MATCHES = 100

function extractTextForSearch(part: ClientPart, currentOptions: SearchOptions): string {
  if (part.type === "text") {
    return typeof (part as any).text === "string" ? (part as any).text : ""
  }

  if (part.type === "tool") {
    if (!currentOptions.includeToolOutputs) return ""
    const toolState = (part as any).state
    const output = toolState?.output
    if (typeof output === "string") return output
    try {
      if (output !== undefined) return JSON.stringify(output)
    } catch {
      // ignore stringify failures
    }
    const metadataOutput = toolState?.metadata?.output
    if (typeof metadataOutput === "string") return metadataOutput
    return ""
  }

  if (part.type === "reasoning") {
    if (!currentOptions.includeReasoning) return ""
    const value = (part as any).text
    if (typeof value === "string") return value
    if (Array.isArray(value)) {
      return value
        .map((entry) => {
          if (typeof entry === "string") return entry
          if (entry && typeof entry === "object") {
            const candidate = entry as { text?: unknown; value?: unknown }
            if (typeof candidate.text === "string") return candidate.text
            if (typeof candidate.value === "string") return candidate.value
          }
          return ""
        })
        .filter(Boolean)
        .join("\n")
    }
    return ""
  }

  return ""
}

// Create search state signals
const [query, setQuery] = createSignal<string>("")
const [isOpen, setIsOpen] = createSignal<boolean>(false)
const [matches, setMatches] = createSignal<SearchMatch[]>([])
const [currentIndex, setCurrentIndex] = createSignal<number>(-1)
const [options, setOptionsState] = createSignal<SearchOptions>({
  caseSensitive: false,
  wholeWord: false,
  includeToolOutputs: false,
  includeReasoning: false,
})
const [instanceId, setInstanceId] = createSignal<string | null>(null)
const [sessionId, setSessionId] = createSignal<string | null>(null)

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 400

/**
 * Open search panel
 * @param scopeInstanceId - Instance ID to search within (null for all)
 * @param scopeSessionId - Session ID to search within (null for all)
 */
export function openSearch(scopeInstanceId?: string, scopeSessionId?: string) {
  setInstanceId(scopeInstanceId ?? null)
  setSessionId(scopeSessionId ?? null)
  setIsOpen(true)
}

/**
 * Close search panel and clear results
 */
export function closeSearch() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }

  batch(() => {
    setIsOpen(false)
    setQuery("")
    setMatches([])
    setCurrentIndex(-1)
  })
}

/**
 * Execute search with current query and options
 * This searches through all messages in the given message store
 * 
 * @param store - The message instance store to search through
 */
export function executeSearch(store: InstanceMessageStore) {
  const currentQuery = query()
  const currentInstanceId = instanceId()
  const currentSessionId = sessionId()
  const currentOptions = options()

  // Early return: empty query
  if (!currentQuery || currentQuery.length < 1) {
    setMatches([])
    setCurrentIndex(-1)
    return
  }

  // If message store not provided, we can't search
  // (This is expected when component first mounts)
  if (!store) {
    return
  }

  try {
    const allMatches: SearchMatch[] = []

    // Access from store's state directly
    const state = store.state

    const sessionRecord = currentSessionId ? state.sessions[currentSessionId] : null

    if (!sessionRecord) {
      setMatches([])
      setCurrentIndex(-1)
      return
    }

    // Get all message IDs in session
    const messageIds = sessionRecord.messageIds || []

    // Search through each message
    searchLoop: for (const messageId of messageIds) {
      const record = state.messages[messageId]
      if (!record) {
        continue
      }

      const parts = record.parts || {}
      const partIds = record.partIds || []

      // Search through each part using partIds order
      for (let partIndex = 0; partIndex < partIds.length; partIndex++) {
        const partId = partIds[partIndex]
        const normalizedPart = parts[partId]
        
        if (!normalizedPart || !normalizedPart.data) {
          continue
        }

        const part = normalizedPart.data

        const text = extractTextForSearch(part, currentOptions)
        if (!text) {
          continue
        }

        // Find matches in this part
        try {
          const partMatches = findMatches(
            text,
            messageId,
            partIndex,
            currentQuery,
            currentOptions
          )
          for (const match of partMatches) {
            allMatches.push(match)
            if (allMatches.length >= MAX_MATCHES) {
              break searchLoop
            }
          }
        } catch (error) {
          // If findMatches throws (e.g., invalid characters), we don't want to crash
          // The search algorithm will show an appropriate error
          console.error("Search error:", error)
          setMatches([])
          setCurrentIndex(-1)
          return
        }
      }
    }

    // Update matches and set closest to viewport as current
    const closestMatchIndex = findClosestMatchToViewport(allMatches)
    batch(() => {
      setMatches(allMatches)
      setCurrentIndex(closestMatchIndex)
    })
  } catch (error) {
    console.error("Search execution error:", error)
    setMatches([])
    setCurrentIndex(-1)
  }
}

/**
 * Navigate to the next match
 * Wraps around to the first match if at the end
 */
export function navigateNext() {
  const totalMatches = matches().length
  if (totalMatches === 0) return

  const nextIndex = (currentIndex() + 1) % totalMatches
  setCurrentIndex(nextIndex)
  
  // Scroll to match after a short delay for reactivity
  requestAnimationFrame(() => {
    scrollToCurrentMatch()
  })
}

/**
 * Navigate to the previous match
 * Wraps around to the last match if at the beginning
 */
export function navigatePrevious() {
  const totalMatches = matches().length
  if (totalMatches === 0) return

  const prevIndex = currentIndex() <= 0 ? totalMatches - 1 : currentIndex() - 1
  setCurrentIndex(prevIndex)  
  // Scroll to match after a short delay for reactivity
  requestAnimationFrame(() => {
    scrollToCurrentMatch()
  })
}

/**
 * Update search options and re-execute search
 * @param newOptions - Partial options to update
 * @param store - Message store for re-execution
 */
export function updateOptions(newOptions: Partial<SearchOptions>, store?: InstanceMessageStore) {
  setOptionsState((prev) => ({ ...prev, ...newOptions }))
  // Re-execute search with new options if store is provided
  if (store) {
    executeSearch(store)
  }
}

/**
 * Set the search query with debounced auto-search
 * @param newQuery - New query string
 * @param store - Message store for search execution (optional)
 */
export function setQueryInput(newQuery: string, store?: InstanceMessageStore) {
  setQuery(newQuery)

  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }

  if (!newQuery || newQuery.length < 1) {
    clearResults()
    return
  }

  searchDebounceTimer = setTimeout(() => {
    if (store) {
      executeSearch(store)
    }
  }, DEBOUNCE_MS)
}

/**
 * Execute search on Enter key (with store ref)
 * @param store - Message store to search through
 */
export function executeSearchOnEnter(store: InstanceMessageStore) {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }

  const currentQuery = query()

  if (currentQuery && currentQuery.length > 0) {
    executeSearch(store)
  } else {
    clearResults()
  }
}

/**
 * Clear search results
 */
export function clearResults() {
  batch(() => {
    setMatches([])
    setCurrentIndex(-1)
  })
}

/**
 * Scroll to current match element in viewport
 * This is called automatically after navigation
 */
async function scrollToCurrentMatch() {
  const currentMatch = getCurrentMatch()
  if (!currentMatch) return

  // Get current instance ID
  const currentInstanceId = instanceId()
  if (!currentInstanceId) return

  // Step 1: Try to expand any collapsed sections containing the match
  const didExpand = expandSectionsForMatch(currentInstanceId, currentMatch)

  // Step 2: Wait for DOM to update if we expanded something
  if (didExpand) {
    await waitForExpansionCompletion(500)
  }

  // Step 3: Try to scroll to the match element
  let scrollToTarget = async () => {
    // Prefer scrolling to the specific mark corresponding to the current match.
    // This is reliable for plain-text highlighting where we render marks with identity attributes.
    const markSelector =
      'mark[data-search-match="true"]' +
      `[data-search-message-id="${CSS.escape(currentMatch.messageId)}"]` +
      `[data-search-part-index="${currentMatch.partIndex}"]` +
      `[data-search-start="${currentMatch.startIndex}"]` +
      `[data-search-end="${currentMatch.endIndex}"]`

    const targetMark = document.querySelector(markSelector)
    if (targetMark) {
      targetMark.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" })
      return true
    }

    // Secondary: markdown highlights can't be mapped to start/end indices reliably,
    // so we tag them with an occurrence index per (messageId, partIndex).
    const partMatches = matches()
      .filter((m) => m.messageId === currentMatch.messageId && m.partIndex === currentMatch.partIndex)
      .slice()
      .sort((a, b) => a.startIndex - b.startIndex)

    const occurrenceIndex = partMatches.findIndex(
      (m) =>
        m.startIndex === currentMatch.startIndex &&
        m.endIndex === currentMatch.endIndex &&
        m.messageId === currentMatch.messageId &&
        m.partIndex === currentMatch.partIndex,
    )

    if (occurrenceIndex >= 0) {
      const occSelector =
        'mark[data-search-match="true"]' +
        `[data-search-message-id="${CSS.escape(currentMatch.messageId)}"]` +
        `[data-search-part-index="${currentMatch.partIndex}"]` +
        `[data-search-occurrence="${occurrenceIndex}"]`

      const occMark = document.querySelector(occSelector)
      if (occMark) {
        occMark.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" })
        return true
      }
    }

    // Fallback: scroll to message anchor if mark not found
    const messageId = currentMatch.messageId
    const elementId = `message-anchor-${messageId}`
    
    const element = document.getElementById(elementId)
    if (element) {
      element.scrollIntoView({ block: "start", inline: "nearest", behavior: "smooth" })
      return true
    }

    return false
  }

  // Try scrolling once, if we expanded and it failed, retry once
  const scrolled = await scrollToTarget()
  if (!scrolled && didExpand) {
    // Wait a bit more and retry
    await new Promise(resolve => setTimeout(resolve, 200))
    await scrollToTarget()
  }
}

/**
 * Get the current search state
 * @returns Complete search state
 */
export function getSearchState(): SearchState {
  return {
    query: query(),
    isOpen: isOpen(),
    matches: matches(),
    currentIndex: currentIndex(),
    options: options(),
    instanceId: instanceId(),
    sessionId: sessionId(),
  }
}

/**
 * Get the currently selected match
 * @returns Current match or null
 */
export function getCurrentMatch(): SearchMatch | null {
  const currentMatches = matches()
  const idx = currentIndex()
  return idx >= 0 && idx < currentMatches.length ? { ...currentMatches[idx] } : null
}

/**
 * Get matches for a specific message
 * @param messageId - Message ID to filter matches
 * @returns Array of matches for the message
 */
export function getMatchesByMessageId(messageId: string): SearchMatch[] {
  return matches().filter((m) => m.messageId === messageId)
}

/**
 * Get the total number of matches
 * @returns Number of matches
 */
export function getMatchCount(): number {
  return matches().length
}

/**
 * Check if there are any matches
 * @returns True if matches exist
 */
export function hasMatches(): boolean {
  return matches().length > 0
}

// Export signals for reactive access
export {
  query,
  isOpen,
  matches,
  currentIndex,
  options,
  instanceId,
  sessionId,
  setInstanceId,
  setSessionId,
}
