/**
 * SearchHighlightedText Component
 * 
 * Wraps text content with search match highlighting.
 * Applies <mark> tags to matching text portions based on current search state.
 * 
 * @module search-highlighted-text
 */

import { createMemo, Show, For } from "solid-js"
import { matches, currentIndex } from "../stores/search-store"
import { getMatchesForMessage } from "../lib/search-highlight"
import type { SearchMatch } from "../types/search"

interface SearchHighlightedTextProps {
  text: string
  messageId: string
  partIndex: number
}

/**
 * Component that wraps text with search match highlighting
 * 
 * Usage:
 * - For user messages: Wrap plain text
 * - For assistant messages: This component returns the text with HTML marks,
 *   which should be processed by the markdown renderer
 */
export default function SearchHighlightedText(props: SearchHighlightedTextProps) {
  // Get matches for this specific message part
  const partMatches = createMemo(() => {
    const allMatches = matches()
    return getMatchesForMessage(allMatches, props.messageId, props.partIndex)
  })

  // Check if there are any matches
  const hasMatches = createMemo(() => partMatches().length > 0)

  // Update current match status based on currentIndex
  const matchesWithCurrentStatus = createMemo(() => {
    const allMatches = matches()
    const globalCurrentIndex = currentIndex()
    const currentMatch = globalCurrentIndex >= 0 ? allMatches[globalCurrentIndex] : null

    return partMatches().map((match) => ({
      ...match,
      isCurrent:
        currentMatch !== null &&
        match.messageId === currentMatch.messageId &&
        match.partIndex === currentMatch.partIndex &&
        match.startIndex === currentMatch.startIndex &&
        match.endIndex === currentMatch.endIndex
    }))
  })

  // Build text segments with highlighting
  const textSegments = createMemo(() => {
    if (!hasMatches()) {
      return [{ type: "text" as const, content: props.text }]
    }

    const sortedMatches = [...matchesWithCurrentStatus()].sort((a, b) => a.startIndex - b.startIndex)
    const segments: Array<
      | { type: "text"; content: string }
      | { type: "match"; content: string; isCurrent?: boolean; startIndex: number; endIndex: number }
    > = []
    let lastIndex = 0

    for (const match of sortedMatches) {
      // Add text before this match
      if (match.startIndex > lastIndex) {
        segments.push({
          type: "text",
          content: props.text.slice(lastIndex, match.startIndex)
        })
      }

      // Add the highlighted match
      segments.push({
        type: "match",
        content: match.text,
        isCurrent: match.isCurrent,
        startIndex: match.startIndex,
        endIndex: match.endIndex,
      })

      lastIndex = match.endIndex
    }

    // Add remaining text after last match
    if (lastIndex < props.text.length) {
      segments.push({
        type: "text",
        content: props.text.slice(lastIndex)
      })
    }

    return segments
  })

  return (
    <Show when={hasMatches()} fallback={<>{props.text}</>}>
      <For each={textSegments()}>
        {(segment) =>
          segment.type === "match" ? (
            <mark
              class={segment.isCurrent ? "search-match search-match--current" : "search-match"}
              data-search-match="true"
              data-search-message-id={props.messageId}
              data-search-part-index={String(props.partIndex)}
              data-search-start={String(segment.startIndex)}
              data-search-end={String(segment.endIndex)}
            >
              {segment.content}
            </mark>
          ) : (
            <>{segment.content}</>
          )
        }
      </For>
    </Show>
  )
}
