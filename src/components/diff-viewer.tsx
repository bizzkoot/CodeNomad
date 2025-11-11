import { createMemo, Show, onMount, createEffect } from "solid-js"
import { DiffView, DiffModeEnum } from "@git-diff-view/solid"
import type { DiffHighlighterLang } from "@git-diff-view/core"
import { getLanguageFromPath } from "../lib/markdown"
import { normalizeDiffText } from "../lib/diff-utils"
import { setToolRenderCache } from "../lib/tool-render-cache"
import type { DiffViewMode } from "../stores/preferences"

interface ToolCallDiffViewerProps {
  diffText: string
  filePath?: string
  theme: "light" | "dark"
  mode: DiffViewMode
  onRendered?: () => void
  cachedHtml?: string
  cacheKey?: string
}

type DiffData = {
  oldFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null }
  newFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null }
  hunks: string[]
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

  const captureAndCacheHtml = () => {
    if (diffContainerRef && props.cacheKey && !props.cachedHtml) {
      // Extract the rendered HTML from DiffView container
      const renderedHtml = diffContainerRef.innerHTML
      if (renderedHtml) {
        setToolRenderCache(props.cacheKey, {
          text: props.diffText,
          html: renderedHtml,
          theme: props.theme,
          mode: props.mode,
        })
      }
    }
    props.onRendered?.()
  }

  // Also capture HTML when diff data changes
  createEffect(() => {
    const data = diffData()
    if (data && !props.cachedHtml) {
      // Delay to allow DiffView to re-render with new data
      setTimeout(captureAndCacheHtml, 100)
    }
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
                <DiffView
                  data={data()}
                  diffViewMode={props.mode === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified}
                  diffViewTheme={props.theme}
                  diffViewHighlight
                  diffViewWrap={false}
                  diffViewFontSize={13}
                />
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