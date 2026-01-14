/**
 * Section Expansion System
 * 
 * Provides centralized control for expanding collapsible/expandable sections
 * when navigating search results. Components can listen for expansion requests
 * and respond by expanding their content.
 * 
 * @module section-expansion
 */

import type { SearchMatch } from "../types/search"

/**
 * Types of collapsible sections that can be expanded
 */
export type SectionExpansionAction =
  | "expand-reasoning"
  | "expand-tool-call"
  | "expand-diagnostics"
  | "expand-folder-node"
  | "expand-session-parent"
  | "expand-sidebar-accordion"

/**
 * Detail payload for section expansion requests
 */
export interface SectionExpansionRequest {
  instanceId: string
  sessionId?: string
  messageId?: string
  partIndex?: number
  partId?: string
  action: SectionExpansionAction
  elementId?: string
  sectionId?: string
}

/**
 * Event name for section expansion requests
 */
export const SECTION_EXPANSION_EVENT = "opencode:section-expansion-request"

/**
 * Track which sections we've already expanded to avoid duplicates
 */
const expandedSections = new Set<string>()

/**
 * Generate unique key for tracking expanded sections
 */
function makeExpansionKey(action: SectionExpansionAction, instanceId: string, identifier: string): string {
  return `${action}:${instanceId}:${identifier}`
}

/**
 * Emit a section expansion request event
 * Components can listen for this event and respond by expanding
 */
export function emitSectionExpansion(detail: SectionExpansionRequest) {
  if (typeof window === "undefined") return
  
  // Generate tracking key
  const identifier = [
    detail.messageId,
    detail.partId,
    detail.elementId,
    detail.sectionId,
  ].filter(Boolean).join(":")
  
  const key = makeExpansionKey(detail.action, detail.instanceId, identifier)
  
  // Skip if already expanded
  if (expandedSections.has(key)) {
    return false
  }
  
  // Mark as expanded
  expandedSections.add(key)
  
  // Dispatch event
  window.dispatchEvent(new CustomEvent<SectionExpansionRequest>(SECTION_EXPANSION_EVENT, { detail }))
  return true
}

/**
 * Clear expansion tracking cache (e.g., when starting a new search)
 */
export function clearExpansionCache() {
  expandedSections.clear()
}

/**
 * Request expansion of a reasoning block
 */
export function requestReasoningExpansion(instanceId: string, messageId: string, partIndex: number) {
  return emitSectionExpansion({
    instanceId,
    messageId,
    partIndex,
    action: "expand-reasoning",
  })
}

/**
 * Request expansion of a tool call output
 */
export function requestToolCallExpansion(instanceId: string, messageId: string, partId: string) {
  return emitSectionExpansion({
    instanceId,
    messageId,
    partId,
    action: "expand-tool-call",
  })
}

/**
 * Request expansion of diagnostics within a tool call
 */
export function requestDiagnosticsExpansion(instanceId: string, messageId: string, partId: string) {
  return emitSectionExpansion({
    instanceId,
    messageId,
    partId,
    action: "expand-diagnostics",
  })
}

/**
 * Request expansion of a sidebar accordion section
 */
export function requestSidebarAccordionExpansion(instanceId: string, sectionId: string) {
  return emitSectionExpansion({
    instanceId,
    sectionId,
    action: "expand-sidebar-accordion",
  })
}

/**
 * Request expansion of a folder tree node
 */
export function requestFolderNodeExpansion(instanceId: string, elementId: string) {
  return emitSectionExpansion({
    instanceId,
    elementId,
    action: "expand-folder-node",
  })
}

/**
 * Request expansion of a session parent in the session list
 */
export function requestSessionParentExpansion(instanceId: string, sessionId: string) {
  return emitSectionExpansion({
    instanceId,
    sessionId,
    action: "expand-session-parent",
  })
}

/**
 * Check if a search match element is inside a collapsed section
 */
export function isMatchInCollapsedSection(matchElement: Element): boolean {
  // Check 1: Parent has aria-expanded="false"
  const toggleParent = matchElement.closest('[aria-expanded]')
  if (toggleParent && toggleParent.getAttribute('aria-expanded') === 'false') {
    return true
  }

  // Check 2: Element is inside reasoning card (no aria-expanded, uses Show component)
  const reasoningCard = matchElement.closest('.message-reasoning-card')
  if (reasoningCard) {
    // Check if content div is rendered
    const content = reasoningCard.querySelector('.message-reasoning-expanded')
    return !content
  }

  // Check 3: Element is inside tool call
  const toolCall = matchElement.closest('.tool-call')
  if (toolCall) {
    const details = toolCall.querySelector('.tool-call-details')
    return !details
  }

  // Check 4: Element is inside folder node
  const folderNode = matchElement.closest('.folder-tree-node')
  if (folderNode) {
    const children = folderNode.querySelector('.folder-tree-node-children')
    return !children
  }

  // Check 5: Element is inside sidebar accordion item
  // Note: Kobalte removes accordion content from DOM when collapsed,
  // so if we found the element it must already be expanded.
  // For this case, always return false since if element exists, it's visible
  const accordionRoot = matchElement.closest('.accordion-root')
  if (accordionRoot) {
    return false
  }

  return false
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

/**
 * Find which collapsible type contains the match element
 */
function identifyCollapsibleParent(matchElement: Element): {
  type: SectionExpansionAction | null
  container: Element | null
  identifiers: Record<string, string>
} {
  // Check reasoning card
  const reasoningCard = matchElement.closest('.message-reasoning-card')
  if (reasoningCard) {
    const messageBlock = reasoningCard.closest('[data-message-id]')
    const messageId = messageBlock?.getAttribute('data-message-id') || ''
    return {
      type: 'expand-reasoning',
      container: reasoningCard,
      identifiers: { messageId, partIndex: matchElement.getAttribute('data-search-part-index') || '0' },
    }
  }

  // Check tool call
  const toolCall = matchElement.closest('.tool-call')
  if (toolCall) {
    const messageBlock = toolCall.closest('[data-message-id]')
    const messageId = messageBlock?.getAttribute('data-message-id') || ''
    const toolKey = toolCall.getAttribute('data-key')
    const partId = toolKey?.split(':').pop() || ''
    
    return {
      type: 'expand-tool-call',
      container: toolCall,
      identifiers: { messageId, partId },
    }
  }

  // Check diagnostics (nested inside tool call)
  const diagnostics = matchElement.closest('.tool-diagnostics-section')
  if (diagnostics) {
    const toolCall = diagnostics.closest('.tool-call')
    const toolKey = toolCall?.getAttribute('data-key')
    const partId = toolKey?.split(':').pop() || ''
    const messageBlock = toolCall?.closest('[data-message-id]')
    const messageId = messageBlock?.getAttribute('data-message-id') || ''
    
    return {
      type: 'expand-diagnostics',
      container: diagnostics,
      identifiers: { messageId, partId },
    }
  }

  // Check folder node
  const folderNode = matchElement.closest('.folder-tree-node')
  if (folderNode) {
    const elementId = folderNode.getAttribute('data-node-id') || ''
    return {
      type: 'expand-folder-node',
      container: folderNode,
      identifiers: { elementId },
    }
  }

  // Check sidebar accordion
  const accordionItem = matchElement.closest('[data-radix-collection-item]')
  if (accordionItem) {
    const sectionId = accordionItem.getAttribute('data-value') || ''
    return {
      type: 'expand-sidebar-accordion',
      container: accordionItem,
      identifiers: { sectionId },
    }
  }

  // Check session list
  const sessionItem = matchElement.closest('.session-item')
  if (sessionItem) {
    const sessionId = sessionItem.getAttribute('data-session-id') || ''
    return {
      type: 'expand-session-parent',
      container: sessionItem,
      identifiers: { sessionId },
    }
  }

  return { type: null, container: null, identifiers: {} }
}

/**
 * Expand all collapsed sections containing a search match
 * Returns true if any expansion was triggered, false otherwise
 */
export function expandSectionsForMatch(instanceId: string, match: SearchMatch): boolean {
  // Try to expand reasoning block first (common case)
  // We know the match data, so we can trigger expansion even if element doesn't exist yet
  if (match.partIndex !== undefined) {
    // Match is in a specific part, try expanding the reasoning block
    const didExpand = requestReasoningExpansion(instanceId, match.messageId, match.partIndex)
    if (didExpand) {
      return true
    }
  }

  // For other cases (tool calls, folders, etc.), we need the element to exist
  // Find the match element
  const selector = buildMatchSelector(match)
  const matchElement = document.querySelector(selector)
  
  if (!matchElement) {
    console.warn(`Match element not found: ${selector}`)
    return false
  }

  // Check if already visible
  if (!isMatchInCollapsedSection(matchElement)) {
    return false
  }

  // Identify what needs to expand
  const { type, identifiers } = identifyCollapsibleParent(matchElement)
  
  if (!type) {
    console.warn('Could not identify collapsible parent for match', match)
    return false
  }

  // Expand based on type
  switch (type) {
    case 'expand-reasoning':
      requestReasoningExpansion(
        instanceId,
        identifiers.messageId,
        parseInt(identifiers.partIndex, 10),
      )
      return true

    case 'expand-tool-call':
      requestToolCallExpansion(instanceId, identifiers.messageId, identifiers.partId)
      return true

    case 'expand-diagnostics':
      requestDiagnosticsExpansion(instanceId, identifiers.messageId, identifiers.partId)
      return true

    case 'expand-folder-node':
      requestFolderNodeExpansion(instanceId, identifiers.elementId)
      return true

    case 'expand-sidebar-accordion':
      requestSidebarAccordionExpansion(instanceId, identifiers.sectionId)
      return true

    case 'expand-session-parent':
      requestSessionParentExpansion(instanceId, identifiers.sessionId)
      return true

    default:
      return false
  }
}

/**
 * Wait for DOM to update after expansion
 */
export function waitForExpansionCompletion(maxWaitMs = 500): Promise<void> {
  return new Promise((resolve) => {
    // Wait for a few frames to let reactivity settle
    let frames = 0
    const checkComplete = () => {
      frames++
      if (frames >= 4) { // ~60-80ms on 60fps
        resolve()
      } else {
        requestAnimationFrame(checkComplete)
      }
    }
    checkComplete()
  })
}
