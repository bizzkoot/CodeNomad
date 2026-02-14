/**
 * Represents a single search match result in a message
 */
export interface SearchMatch {
  /** Unique identifier of the message containing the match */
  messageId: string

  /** Index of the part within the message (0-based) */
  partIndex: number

  /** Starting character index of the match in the text */
  startIndex: number

  /** Ending character index of the match in the text */
  endIndex: number

  /** The actual matched text content */
  text: string

  /** Whether this match is currently highlighted/selected */
  isCurrent: boolean
}

/**
 * Search configuration options
 */
export interface SearchOptions {
  /** Whether the search should be case-sensitive */
  caseSensitive: boolean

  /** Whether the search should match whole words only */
  wholeWord: boolean

  /** Whether to include tool output content in search */
  includeToolOutputs: boolean

  /** Whether to include reasoning content in search */
  includeReasoning: boolean
}

/**
 * Complete search state for the application
 */
export interface SearchState {
  /** Current search query string */
  query: string

  /** Whether the search panel is open visible */
  isOpen: boolean

  /** Array of all search matches found */
  matches: SearchMatch[]

  /** Index of the currently selected match (-1 if none selected) */
  currentIndex: number

  /** Active search configuration options */
  options: SearchOptions

  /** Instance ID to constrain search scope (null for all instances) */
  instanceId: string | null

  /** Session ID to constrain search scope (null for all sessions) */
  sessionId: string | null
}
