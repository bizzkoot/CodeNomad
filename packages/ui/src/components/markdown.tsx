import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { renderMarkdown, onLanguagesLoaded, decodeHtmlEntities } from "../lib/markdown"
import { useGlobalCache } from "../lib/hooks/use-global-cache"
import type { TextPart, RenderCache } from "../types/message"
import { getLogger } from "../lib/logger"
import { copyToClipboard } from "../lib/clipboard"
import { useI18n } from "../lib/i18n"
import {
  matches as searchMatches,
  currentIndex as searchCurrentIndex,
  isOpen as searchIsOpen,
  query as searchQuery,
} from "../stores/search-store"

const log = getLogger("session")

function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function resolvePartVersion(part: TextPart, text: string): string {
  if (typeof part.version === "number") {
    return String(part.version)
  }
  return `text-${hashText(text)}`
}

interface MarkdownProps {
  part: TextPart
  instanceId?: string
  sessionId?: string
  messageId?: string
  partIndex?: number
  isDark?: boolean
  size?: "base" | "sm" | "tight"
  disableHighlight?: boolean
  onRendered?: () => void
}

export function Markdown(props: MarkdownProps) {
  const { t } = useI18n()
  const [html, setHtml] = createSignal("")
  let containerRef: HTMLDivElement | undefined
  let latestRequestedText = ""
  let highlightTimeout: ReturnType<typeof setTimeout> | undefined

  function clearSearchMarks() {
    if (!containerRef) return
    const marks = containerRef.querySelectorAll("mark.search-match")
    for (const mark of Array.from(marks)) {
      const parent = mark.parentNode
      if (!parent) continue
      parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark)
      parent.normalize()
    }
  }

  function applySearchHighlights() {
    if (!containerRef) return

    // Early check: container must have content
    if (!containerRef.hasChildNodes()) return

    if (!searchIsOpen()) {
      clearSearchMarks()
      return
    }

    const q = searchQuery()
    if (!q) {
      clearSearchMarks()
      return
    }

    // If store has no matches, do nothing.
    // (We still clear to remove stale highlights.)
    const allMatches = searchMatches()
    if (allMatches.length === 0) {
      clearSearchMarks()
      return
    }

    // Best-effort DOM highlight for markdown blocks: wrap occurrences in text nodes.
    // We intentionally avoid code/pre/link nodes to prevent breaking markup.
    clearSearchMarks()

    const queryLower = q.toLowerCase()
    const scopeMessageId = props.messageId
    const scopePartIndex = typeof props.partIndex === "number" ? props.partIndex : null

    let nodes: Text[] = []
    try {
      const walker = document.createTreeWalker(containerRef, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const text = node.textContent
          if (!text || !text.trim()) return NodeFilter.FILTER_REJECT
          const parent = (node as Text).parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          if (parent.closest("code, pre, a")) return NodeFilter.FILTER_REJECT
          if (parent.closest("mark.search-match")) return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        },
      })

      let currentNode: Node | null
      while ((currentNode = walker.nextNode())) {
        nodes.push(currentNode as Text)
      }
    } catch (error) {
      log.error("Error during TreeWalker traversal:", error)
      return
    }

    let globalIndexOffset = 0
    // Track occurrence index within this (messageId, partIndex) scope for navigation
    let occurrenceIndex = 0

    try {
      for (const textNode of nodes) {
        const original = textNode.textContent ?? ""
        const haystack = original.toLowerCase()
        let fromIndex = 0
        const occurrences: Array<{ start: number; end: number }> = []

        while (true) {
          const at = haystack.indexOf(queryLower, fromIndex)
          if (at === -1) break
          occurrences.push({ start: at, end: at + q.length })
          fromIndex = at + 1
          if (occurrences.length > 200) break
        }

        if (occurrences.length === 0) {
          globalIndexOffset += original.length
          continue
        }

        const fragment = document.createDocumentFragment()
        let last = 0
        for (const occ of occurrences) {
          if (occ.start > last) {
            fragment.appendChild(document.createTextNode(original.slice(last, occ.start)))
          }
          const mark = document.createElement("mark")
          mark.className = "search-match"
          mark.setAttribute("data-search-match", "true")
          if (scopeMessageId && scopePartIndex !== null) {
            const globalStart = globalIndexOffset + occ.start
            const globalEnd = globalIndexOffset + occ.end
            mark.setAttribute("data-search-message-id", scopeMessageId)
            mark.setAttribute("data-search-part-index", String(scopePartIndex))
            mark.setAttribute("data-search-start", String(globalStart))
            mark.setAttribute("data-search-end", String(globalEnd))
            // Add occurrence index for reliable navigation
            mark.setAttribute("data-search-occurrence", String(occurrenceIndex))
            occurrenceIndex++
          }
          mark.textContent = original.slice(occ.start, occ.end)
          fragment.appendChild(mark)
          last = occ.end
        }
        if (last < original.length) {
          fragment.appendChild(document.createTextNode(original.slice(last)))
        }

        textNode.parentNode?.replaceChild(fragment, textNode)
        globalIndexOffset += original.length
      }
    } catch (error) {
      log.error("Error applying search highlights:", error)
    }

    // Distinguish the current match.
    // First, remove any existing --current class to ensure clean state
    try {
      const existingCurrent = containerRef.querySelector("mark.search-match--current")
      if (existingCurrent) {
        existingCurrent.classList.remove("search-match--current")
      }
    } catch (error) {
      // Ignore errors during cleanup
    }

    try {
      const idx = searchCurrentIndex()
      if (idx >= 0) {
        const currentMatch = allMatches[idx]
        
        // Only proceed if this message/part contains the current match
        if (scopeMessageId && scopePartIndex !== null && currentMatch &&
            currentMatch.messageId === scopeMessageId && 
            currentMatch.partIndex === scopePartIndex) {
          
          // Method 1: Try direct start/end index matching first
          const directSelector =
            `mark.search-match[data-search-match="true"]` +
            `[data-search-message-id="${CSS.escape(scopeMessageId)}"]` +
            `[data-search-part-index="${scopePartIndex}"]` +
            `[data-search-start="${currentMatch.startIndex}"]` +
            `[data-search-end="${currentMatch.endIndex}"]`
          const directMark = containerRef.querySelector(directSelector)
          if (directMark) {
            directMark.classList.add("search-match--current")
            return
          }

          // Method 2: Use occurrence index - calculate which occurrence this is
          // Get all matches for this message/part from the store, sorted by position
          const partMatches = allMatches
            .filter((m) => m.messageId === scopeMessageId && m.partIndex === scopePartIndex)
            .slice()
            .sort((a, b) => a.startIndex - b.startIndex)

          const occIdx = partMatches.findIndex(
            (m) =>
              m.startIndex === currentMatch.startIndex &&
              m.endIndex === currentMatch.endIndex &&
              m.messageId === currentMatch.messageId &&
              m.partIndex === currentMatch.partIndex
          )

          if (occIdx >= 0) {
            const occSelector =
              `mark.search-match[data-search-match="true"]` +
              `[data-search-message-id="${CSS.escape(scopeMessageId)}"]` +
              `[data-search-part-index="${scopePartIndex}"]` +
              `[data-search-occurrence="${occIdx}"]`
            const occMark = containerRef.querySelector(occSelector)
            if (occMark) {
              occMark.classList.add("search-match--current")
              return
            }
          }
        }
      }
    } catch (error) {
      log.error("Error marking current match:", error)
    }
  }

  const notifyRendered = () => {
    Promise.resolve().then(() => props.onRendered?.())
  }

  const resolved = createMemo(() => {
    const part = props.part
    const rawText = typeof part.text === "string" ? part.text : ""
    const text = decodeHtmlEntities(rawText)
    const themeKey = Boolean(props.isDark) ? "dark" : "light"
    const highlightEnabled = !props.disableHighlight
    const partId = typeof part.id === "string" && part.id.length > 0 ? part.id : ""
    if (!partId) {
      throw new Error("Markdown rendering requires a part id")
    }
    const version = resolvePartVersion(part, text)
    return { part, text, themeKey, highlightEnabled, partId, version }
  })

  const cacheHandle = useGlobalCache({
    instanceId: () => props.instanceId,
    sessionId: () => props.sessionId,
    scope: "markdown",
    cacheId: () => {
      const { partId, themeKey, highlightEnabled } = resolved()
      return `${partId}:${themeKey}:${highlightEnabled ? 1 : 0}`
    },
    version: () => resolved().version,
  })

  createEffect(async () => {
    const { part, text, themeKey, highlightEnabled, version } = resolved()

    latestRequestedText = text

    const cacheMatches = (cache: RenderCache | undefined) => {
      if (!cache) return false
      return cache.theme === themeKey && cache.mode === version
    }

    const localCache = part.renderCache
    if (localCache && cacheMatches(localCache)) {
      setHtml(localCache.html)
      notifyRendered()
      return
    }

    const globalCache = cacheHandle.get<RenderCache>()
    if (globalCache && cacheMatches(globalCache)) {
      setHtml(globalCache.html)
      part.renderCache = globalCache
      notifyRendered()
      return
    }

    const commitCacheEntry = (renderedHtml: string) => {
      const cacheEntry: RenderCache = { text, html: renderedHtml, theme: themeKey, mode: version }
      setHtml(renderedHtml)
      part.renderCache = cacheEntry
      cacheHandle.set(cacheEntry)
      notifyRendered()
    }

    if (!highlightEnabled) {
      part.renderCache = undefined

      try {
        const rendered = await renderMarkdown(text, { suppressHighlight: true })

        if (latestRequestedText === text) {
          commitCacheEntry(rendered)
        }
      } catch (error) {
        log.error("Failed to render markdown:", error)
        if (latestRequestedText === text) {
          commitCacheEntry(text)
        }
      }
      return
    }

    try {
      const rendered = await renderMarkdown(text)
      if (latestRequestedText === text) {
        commitCacheEntry(rendered)
      }
    } catch (error) {
      log.error("Failed to render markdown:", error)
      if (latestRequestedText === text) {
        commitCacheEntry(text)
      }
    }
  })

  onMount(() => {
    const handleClick = async (e: Event) => {
      const target = e.target as HTMLElement
      const copyButton = target.closest(".code-block-copy") as HTMLButtonElement

      if (copyButton) {
        e.preventDefault()
        const code = copyButton.getAttribute("data-code")
        if (code) {
          const decodedCode = decodeURIComponent(code)
          const success = await copyToClipboard(decodedCode)
          const copyText = copyButton.querySelector(".copy-text")
          if (copyText) {
            if (success) {
              copyText.textContent = t("markdown.codeBlock.copy.copied")
              setTimeout(() => {
                copyText.textContent = t("markdown.codeBlock.copy.label")
              }, 2000)
            } else {
              copyText.textContent = t("markdown.codeBlock.copy.failed")
              setTimeout(() => {
                copyText.textContent = t("markdown.codeBlock.copy.label")
              }, 2000)
            }
          }
        }
      }
    }

    containerRef?.addEventListener("click", handleClick)

    const cleanupLanguageListener = onLanguagesLoaded(async () => {
      if (props.disableHighlight) {
        return
      }

      const { part, text, themeKey, version } = resolved()

      if (latestRequestedText !== text) {
        return
      }

      try {
        const rendered = await renderMarkdown(text)
        if (latestRequestedText === text) {
          const cacheEntry: RenderCache = { text, html: rendered, theme: themeKey, mode: version }
          setHtml(rendered)
          part.renderCache = cacheEntry
          cacheHandle.set(cacheEntry)
          notifyRendered()
        }
      } catch (error) {
        log.error("Failed to re-render markdown after language load:", error)
      }
    })

    onCleanup(() => {
      containerRef?.removeEventListener("click", handleClick)
      cleanupLanguageListener()

      // Clear any pending timeout
      if (highlightTimeout) {
        clearTimeout(highlightTimeout)
        highlightTimeout = undefined
      }
    })
  })

  const proseClass = () => "markdown-body"

  function waitForDOMAndApplyHighlights() {
    if (!containerRef) return

    // Clear any existing timeout
    if (highlightTimeout) {
      clearTimeout(highlightTimeout)
      highlightTimeout = undefined
    }

    // Early exit if no container content or search not active
    if (!containerRef.hasChildNodes() || !searchIsOpen() || !searchQuery() || searchMatches().length === 0) {
      applySearchHighlights()
      return
    }

    // Retry logic with rAF to wait for DOM to fully render
    let retryCount = 0
    const maxRetries = 8

    const tryApplyHighlights = () => {
      if (retryCount >= maxRetries) {
        // Max retries reached, apply highlights anyway
        applySearchHighlights()
        return
      }

      // Count existing highlighted nodes before applying
      const existingHighlights = containerRef!.querySelectorAll("mark.search-match").length

      // Apply highlights
      applySearchHighlights()

      // Count highlighted nodes after applying
      const newHighlights = containerRef!.querySelectorAll("mark.search-match").length

      // Check if we found all expected matches
      const expectedMatches = searchMatches().length
      const expectedForThisPart = expectedMatches > 0 ? expectedMatches : 0

      // If we found highlights, or no matches expected, or content is stable
      if (newHighlights > 0 || expectedForThisPart === 0 || existingHighlights === newHighlights && retryCount > 2) {
        // Success or stable, no need to retry
        return
      }

      // Retry after one frame
      retryCount++
      highlightTimeout = setTimeout(() => {
        requestAnimationFrame(tryApplyHighlights)
      }, 0)
    }

    // Start retry sequence
    tryApplyHighlights()
  }

  createEffect(() => {
    // Re-apply DOM highlights when search state changes
    searchIsOpen()
    searchQuery()
    searchMatches()
    searchCurrentIndex()

    // Wait for DOM to fully render before applying highlights
    waitForDOMAndApplyHighlights()
  })

  return <div ref={containerRef} class={proseClass()} innerHTML={html()} />
}
