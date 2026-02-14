/**
 * Search Algorithm for Message Content
 * 
 * This module provides efficient text search functionality for finding matches
 * in message content with support for case-sensitive and whole-word matching.
 * 
 * @example
 * ```typescript
 * import { findMatches } from './search-algorithm'
 * 
 * const matches = findMatches(
 *   "Hello world! Hello again.",
 *   "msg-123",
 *   0,
 *   "hello",
 *   { caseSensitive: false, wholeWord: false, includeToolOutputs: false, includeReasoning: false }
 * )
 * // Returns: [
 * //   { messageId: "msg-123", partIndex: 0, startIndex: 0, endIndex: 5, text: "Hello", isCurrent: false },
 * //   { messageId: "msg-123", partIndex: 0, startIndex: 13, endIndex: 18, text: "Hello", isCurrent: false }
 * // ]
 * ```
 */

import type { SearchMatch, SearchOptions } from '../types/search'

/**
 * Validates that the query contains only text characters
 * Non-text characters include special symbols that could cause issues
 * 
 * @param query - The search query string to validate
 * @returns true if the query contains non-text characters, false otherwise
 */
function hasNonTextCharacters(query: string): boolean {
  // Allow:
  // - Unicode letters (including non-Latin scripts)
  // - Numbers
  // - Whitespace characters
  // - Basic punctuation: . , ; : ! ? ( ) [ ] { } " ' - _ +
  // Detect disallowed symbols: @ # $ % ^ & * < > \ / = ` ~ | etc.
  const symbolPattern = /[@#$%^&*<>/\\=`~|]/
  return symbolPattern.test(query)
}

/**
 * Escapes special regex characters in a string
 * This prevents errors when using the string in a regex pattern
 * 
 * @param str - The string to escape
 * @returns The escaped string safe for use in regex
 */
function escapeRegexSpecialChars(str: string): string {
  // Regex metacharacters to escape: \ ^ $ * + ? . ( ) | [ ] { }
  return str.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')
}

/**
 * Finds all matches of a query string within a text
 * 
 * This function efficiently searches for text matches with support for:
 * - Case-sensitive and case-insensitive matching
 * - Whole-word and substring matching
 * - Original position preservation for highlighting
 * - Unicode characters (including non-Latin scripts)
 * 
 * Note on whole-word matching:
 * - Word boundaries (\b) match between word characters (letters, numbers, underscore)
 * and non-word characters (spaces, punctuation, etc.)
 * - Punctuation in the query (like ".", ",", "!" etc.) is treated as part of the query
 * - For example, searching "world" in "Hello (world)!" will find "world" because
 *   parentheses and spaces are non-word characters
 * 
 * @param text - The text content to search within
 * @param messageId - The unique identifier of the message containing the text
 * @param partIndex - The index of the part within the message (0-based)
 * @param query - The search query string
 * @param options - Search configuration options
 * @returns Array of SearchMatch objects, or empty array if no matches found
 * @throws Error if query contains non-text characters (symbols like @, #, $, etc.)
 * 
 * @example
 * ```typescript
 * // Case-insensitive substring search
 * const matches1 = findMatches("Hello World", "msg-1", 0, "hello", {
 *   caseSensitive: false,
 *   wholeWord: false,
 *   includeToolOutputs: false,
 *   includeReasoning: false
 * })
 * // Returns: [{ messageId: "msg-1", partIndex: 0, startIndex: 0, endIndex: 5, text: "Hello", isCurrent: false }]
 * 
 * // Case-sensitive whole-word search
 * const matches2 = findMatches("Hello World", "msg-1", 0, "Hello", {
 *   caseSensitive: true,
 *   wholeWord: true,
 *   includeToolOutputs: false,
 *   includeReasoning: false
 * })
 * // Returns: [{ messageId: "msg-1", partIndex: 0, startIndex: 0, endIndex: 5, text: "Hello", isCurrent: false }]
 * 
 * // No matches
 * const matches3 = findMatches("Hello World", "msg-1", 0, "Goodbye", {
 *   caseSensitive: false,
 *   wholeWord: false,
 *   includeToolOutputs: false,
 *   includeReasoning: false
 * }) // Returns: []
 * 
 * // Unicode support
 * const matches4 = findMatches("Hello 你好 World", "msg-1", 0, "你好", {
 *   caseSensitive: true,
 *   wholeWord: false,
 *   includeToolOutputs: false,
 *   includeReasoning: false
 * })
 * // Returns: [{ messageId: "msg-1", partIndex: 0, startIndex: 6, endIndex: 8, text: "你好", isCurrent: false }]
 * ```
 */
export function findMatches(
  text: string,
  messageId: string,
  partIndex: number,
  query: string,
  options: SearchOptions
): SearchMatch[] {
  // Early return: query is empty or too short
  if (!query || query.length < 1) {
    return []
  }

  // Validation: check for non-text characters (symbols)
  if (hasNonTextCharacters(query)) {
    throw new Error(
      'Search query contains invalid characters. Please use only letters, numbers, spaces, and basic punctuation (. , ; : ! ? ( ) [ ] { } " \' - _ +). Symbols are not supported in this simple search function.'
    )
  }

  // Prepare text and query based on case sensitivity
  let searchText = text
  let searchQuery = query
  
  if (!options.caseSensitive) {
    // Case-insensitive: use lowercase versions for searching
    searchText = text.toLowerCase()
    searchQuery = query.toLowerCase()
  } else {
    // Case-sensitive: use original text and query
    searchText = text
    searchQuery = query
  }

  const matches: SearchMatch[] = []

  if (options.wholeWord) {
    // Whole-word matching using regex
    // Escape special regex characters in the query
    const escapedQuery = escapeRegexSpecialChars(searchQuery)
    
    // Build regex pattern with word boundaries
    const pattern = new RegExp(`\\b${escapedQuery}\\b`, 'g')
    
    // Find all matches using regex
    const regexMatches = searchText.matchAll(pattern)
    
    for (const match of regexMatches) {
      const startIndex = match.index!
      const endIndex = startIndex + match[0].length
      
      // Use original text to get the actual matched substring
      const matchedText = text.slice(startIndex, endIndex)
      
      matches.push({
        messageId,
        partIndex,
        startIndex,
        endIndex,
        text: matchedText,
        isCurrent: false // Will be set by the store
      })
    }
  } else {
    // Substring matching using indexOf for efficiency
    let index = 0
    
    // Use while loop to find all occurrences
    while (true) {
      index = searchText.indexOf(searchQuery, index)
      
      // No more matches found
      if (index === -1) {
        break
      }
      
      const endIndex = index + searchQuery.length
      
      // Use original text to get the actual matched substring
      const matchedText = text.slice(index, endIndex)
      
      matches.push({
        messageId,
        partIndex,
        startIndex: index,
        endIndex,
        text: matchedText,
        isCurrent: false // Will be set by the store
      })
      
      // Move past this match to find the next one
      index += 1
    }
  }

  return matches
}
