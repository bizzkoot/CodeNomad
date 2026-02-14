import { createAnsiSequenceParser, createColorPalette } from "ansi-sequence-parser"

const ESC_CHAR = "\u001b"
const ANSI_LITERAL_PATTERN = /\\u001b|\\x1b|\\033/
const ANSI_ESCAPE_PATTERN = /\u001b/

const DIFF_ADDED_LINE = /^(?!\+\+\+ )(\+.*)$/gm
const DIFF_REMOVED_LINE = /^(?!--- )(-.*)$/gm
const DIFF_CONTEXT_LINE = /^(@@ .* @@)$/gm
const DIFF_HEADER_LINE = /^(diff --git|index |--- |\+\+\+ |Binary files)/gm

const colorPalette = createColorPalette()

export function hasAnsi(text: string): boolean {
  const normalized = normalizeAnsiText(text)
  return ANSI_ESCAPE_PATTERN.test(normalized)
}

export function ansiToHtml(text: string): string {
  const normalized = normalizeAnsiText(text)
  const parser = createAnsiSequenceParser()
  const tokens = parser.parse(normalized)
  return tokensToHtml(tokens)
}

export function isDiffContent(text: string): boolean {
  return DIFF_HEADER_LINE.test(text) || DIFF_ADDED_LINE.test(text) || DIFF_REMOVED_LINE.test(text)
}

export function highlightDiff(html: string): string {
  return html
    .replace(DIFF_ADDED_LINE, '<span class="diff-added">$1</span>')
    .replace(DIFF_REMOVED_LINE, '<span class="diff-removed">$1</span>')
    .replace(DIFF_CONTEXT_LINE, '<span class="diff-context">$1</span>')
}

export interface AnsiStreamRenderer {
  reset: () => void
  render: (chunk: string) => string
}

export function createAnsiStreamRenderer(): AnsiStreamRenderer {
  let parser = createAnsiSequenceParser()

  return {
    reset() {
      parser = createAnsiSequenceParser()
    },
    render(chunk: string) {
      const normalized = normalizeAnsiText(chunk)
      const tokens = parser.parse(normalized)
      return tokensToHtml(tokens)
    },
  }
}

function normalizeAnsiText(text: string): string {
  if (!ANSI_LITERAL_PATTERN.test(text)) {
    return text
  }

  return text
    .replace(/\\u001b/gi, ESC_CHAR)
    .replace(/\\x1b/gi, ESC_CHAR)
    .replace(/\\033/g, ESC_CHAR)
}

function tokensToHtml(tokens: { value: string; foreground: unknown; background: unknown; decorations: Set<string> }[]): string {
  let html = ""

  for (const token of tokens) {
    if (!token.value) {
      continue
    }

    const styles = buildTokenStyles(token)
    const escaped = escapeHtml(token.value)

    if (!styles) {
      html += escaped
      continue
    }

    html += `<span style="${styles}">${escaped}</span>`
  }

  return html
}

function buildTokenStyles(token: { foreground: any; background: any; decorations: Set<string> }): string | null {
  const decorations = token.decorations
  let foreground = token.foreground ? colorPalette.value(token.foreground) : null
  let background = token.background ? colorPalette.value(token.background) : null

  if (decorations.has("reverse")) {
    const swapped = foreground
    foreground = background
    background = swapped
  }

  const styles: string[] = []

  if (foreground) {
    styles.push(`color: ${foreground}`)
  }

  if (background) {
    styles.push(`background-color: ${background}`)
  }

  if (decorations.has("bold")) {
    styles.push("font-weight: 600")
  }

  if (decorations.has("dim")) {
    styles.push("opacity: 0.7")
  }

  if (decorations.has("italic")) {
    styles.push("font-style: italic")
  }

  const lines: string[] = []
  if (decorations.has("underline")) {
    lines.push("underline")
  }
  if (decorations.has("strikethrough")) {
    lines.push("line-through")
  }
  if (decorations.has("overline")) {
    lines.push("overline")
  }
  if (lines.length > 0) {
    styles.push(`text-decoration-line: ${lines.join(" ")}`)
  }

  if (decorations.has("hidden")) {
    styles.push("color: transparent")
    styles.push("background-color: transparent")
  }

  return styles.length > 0 ? styles.join("; ") : null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
