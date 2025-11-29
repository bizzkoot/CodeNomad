import { createMemo, Show, createEffect, onCleanup } from "solid-js"
import { DiffView, DiffModeEnum } from "@git-diff-view/solid"
import type { DiffHighlighterLang } from "@git-diff-view/core"
import { ErrorBoundary } from "solid-js"
import { getLanguageFromPath } from "../lib/markdown"
import { normalizeDiffText } from "../lib/diff-utils"
import { setCacheEntry } from "../lib/global-cache"
import type { CacheEntryParams } from "../lib/global-cache"
import type { DiffViewMode } from "../stores/preferences"

interface ToolCallDiffViewerProps {
  diffText: string
  filePath?: string
  theme: "light" | "dark"
  mode: DiffViewMode
  onRendered?: () => void
  cachedHtml?: string
  cacheEntryParams?: CacheEntryParams
}

type DiffData = {
  oldFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null }
  newFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null }
  hunks: string[]
}

type CaptureContext = {
  theme: ToolCallDiffViewerProps["theme"]
  mode: DiffViewMode
  diffText: string
  cacheEntryParams?: CacheEntryParams
}

export function ToolCallDiffViewer(props: ToolCallDiffViewerProps) {
  const diffData = createMemo<DiffData | null>(() => {
    const normalized = normalizeDiffText(props.diffText)
    if (!normalized) {
      return null
    }

    const language = getLanguageFromPath(props.filePath) || "text"
    const fileName = props.filePath || "diff"

    return {
      oldFile: {
        fileName,
        fileLang: (language || "text") as DiffHighlighterLang | null,
      },
      newFile: {
        fileName,
        fileLang: (language || "text") as DiffHighlighterLang | null,
      },
      hunks: [normalized],
    }
  })

  let diffContainerRef: HTMLDivElement | undefined
  let pendingCapture: number | undefined
  let pendingContext: CaptureContext | undefined
  let lastRenderedMarkup: string | undefined
  let lastCachedHtml: string | undefined

  const clearPendingCapture = () => {
    if (pendingCapture !== undefined) {
      cancelAnimationFrame(pendingCapture)
      pendingCapture = undefined
    }
    pendingContext = undefined
  }

  const runCapture = (context: CaptureContext) => {
    if (!diffContainerRef) {
      props.onRendered?.()
      return
    }

    const markup = diffContainerRef.innerHTML
    if (!markup) {
      props.onRendered?.()
      return
    }

    const hasChanged = markup !== lastRenderedMarkup
    if (hasChanged) {
      lastRenderedMarkup = markup
      if (context.cacheEntryParams) {
        setCacheEntry(context.cacheEntryParams, {
          text: context.diffText,
          html: markup,
          theme: context.theme,
          mode: context.mode,
        })
      }
    }

    props.onRendered?.()
  }

  const scheduleCapture = (context: CaptureContext) => {
    clearPendingCapture()
    pendingContext = context
    pendingCapture = requestAnimationFrame(() => {
      const activeContext = pendingContext
      pendingContext = undefined
      pendingCapture = undefined
      if (activeContext) {
        runCapture(activeContext)
      }
    })
  }

  createEffect(() => {
    const cachedHtml = props.cachedHtml
    if (cachedHtml) {
      clearPendingCapture()
      if (cachedHtml !== lastCachedHtml) {
        lastCachedHtml = cachedHtml
        lastRenderedMarkup = cachedHtml
        props.onRendered?.()
      }
      return
    }

    lastCachedHtml = undefined

    const data = diffData()
    const theme = props.theme
    const mode = props.mode

    if (!data) {
      clearPendingCapture()
      return
    }

    scheduleCapture({
      theme,
      mode,
      diffText: props.diffText,
      cacheEntryParams: props.cacheEntryParams,
    })
  })

  onCleanup(() => {
    clearPendingCapture()
  })

  return (
    <div class="tool-call-diff-viewer">
      <Show
        when={props.cachedHtml}
        fallback={
          <div ref={diffContainerRef}>
            <Show
              when={diffData()}
              fallback={<pre class="tool-call-diff-fallback">{props.diffText}</pre>}
            >
              {(data) => (
                <ErrorBoundary fallback={(error) => {
                  console.warn("Failed to render diff view", error)
                  return <pre class="tool-call-diff-fallback">{props.diffText}</pre>
                }}>
                  <DiffView
                    data={data()}
                    diffViewMode={props.mode === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified}
                    diffViewTheme={props.theme}
                    diffViewHighlight
                    diffViewWrap={false}
                    diffViewFontSize={13}
                  />
                </ErrorBoundary>
              )}
            </Show>
          </div>
        }
      >
        <div innerHTML={props.cachedHtml} />
      </Show>
    </div>
  )
}