import { lazy, Suspense, type Component, type JSX, splitProps } from "solid-js"
import type { ToolCallDiffViewerProps } from "./diff-viewer"

// Lazy load the heavy diff viewer component
const LazyDiffViewer = lazy(async () => {
  const module = await import("./diff-viewer")
  return { default: module.ToolCallDiffViewer }
})

interface LazyToolCallDiffViewerProps extends ToolCallDiffViewerProps {
  fallback?: JSX.Element
}

export const LazyToolCallDiffViewer: Component<LazyToolCallDiffViewerProps> = (props) => {
  const [local, others] = splitProps(props, ["fallback"])

  const fallbackElement = () =>
    local.fallback || (
      <div class="tool-call-diff-viewer">
        <pre class="tool-call-diff-fallback">{others.diffText}</pre>
      </div>
    )

  return (
    <Suspense fallback={fallbackElement()}>
      <LazyDiffViewer {...others} />
    </Suspense>
  )
}
