/**
 * Search Highlight Utilities
 * 
 * Helper functions for rendering search matches in text content.
 * Provides utilities to wrap matched text with <mark> tags
 * while preserving the structure for markdown rendering.
 * 
 * @module search-highlight
 */

import type { SearchMatch } from "../types/search"

/**
 * Highlight matches in plain text content
 * 
 * Wraps matching text portions with <mark class="search-match"> tags.
 * The current match gets a distinctive class.
 * 
 * @param text - The text content to highlight
 * @param matches - Array of SearchMatch objects for this text
 * @returns Array of string/element parts to render
 * 
 * @example
 * ```typescript
 * const parts = highlightTextInContent(
 *   "Hello world! Hello again.",
 *   [
 *     { messageId: "msg-1", partIndex: 0, startIndex: 0, endIndex: 5, text: "Hello", isCurrent: true },
 *     { messageId: "msg-1", partIndex: 0, startIndex: 13, endIndex: 18, text: "Hello", isCurrent: false }
 *   ]
 * )
 * // Returns: [
 * //   "<mark class=\"search-match search-match--current\">Hello</mark>",
 * //   " world! ",
 * //   "<mark class=\"search-match\">Hello</mark>",
 * //   " again."
 * // ]
 * ```
 */
export function highlightTextInContent(
  text: string,
  matches: SearchMatch[]
): (string | HTMLElement)[] {
  if (matches.length === 0) {
    return [text]
  }

  // Sort matches by position to process in order
  const sortedMatches = [...matches].sort((a, b) => a.startIndex - b.startIndex)

  const parts: (string | HTMLElement)[] = []
  let lastIndex = 0

  for (const match of sortedMatches) {
    // Add text before this match
    if (match.startIndex > lastIndex) {
      parts.push(text.slice(lastIndex, match.startIndex))
    }

    // Add the highlighted match
    const mark = document.createElement("mark")
    mark.className = match.isCurrent 
      ? "search-match search-match--current" 
      : "search-match"
    mark.textContent = match.text
    parts.push(mark)

    lastIndex = match.endIndex
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

/**
 * Get matches for a specific message and part
 * 
 * Filters the global matches array to only those matching
 * the given message ID and part index.
 * 
 * @param allMatches - All search matches from the search store
 * @param messageId - Message ID to filter by
 * @param partIndex - Part index to filter by (optional)
 * @returns Filtered matches for the message part
 */
export function getMatchesForMessage(
  allMatches: SearchMatch[],
  messageId: string,
  partIndex?: number
): SearchMatch[] {
  return allMatches.filter((match) => {
    if (match.messageId !== messageId) return false
    if (partIndex !== undefined && match.partIndex !== partIndex) return false
    return true
  })
}

/**
 * Check if content has any search matches
 * 
 * @param allMatches - All search matches from the search store
 * @param messageId - Message ID to check
 * @param partIndex - Part index to check (optional)
 * @returns True if there are matches for this content
 */
export function hasMatchesForContent(
  allMatches: SearchMatch[],
  messageId: string,
  partIndex?: number
): boolean {
  return getMatchesForMessage(allMatches, messageId, partIndex).length > 0
}

/**
 * Get the index of the current match in the content
 * 
 * @param allMatches - All search matches from the search store
 * @param messageId - Message ID
 * @param partIndex - Part index (optional)
 * @returns Index of current match, or -1 if none
 */
export function getCurrentMatchIndex(
  allMatches: SearchMatch[],
  messageId: string,
  partIndex?: number
): number {
  const matches = getMatchesForMessage(allMatches, messageId, partIndex)
  return matches.findIndex((m) => m.isCurrent)
}
