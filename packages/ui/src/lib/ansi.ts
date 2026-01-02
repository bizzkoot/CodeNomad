import AnsiToHtml from "ansi-to-html"

const ESC_CHAR = "\u001b"
const ANSI_LITERAL_PATTERN = /\\u001b|\\x1b|\\033/
const ANSI_SGR_PATTERN = /\u001b\[[0-9;]*m/
const ANSI_NON_SGR_PATTERN = /\u001b\[[0-9;?]*[A-Za-ln-zA-LN-Z]/g
const ANSI_SGR_CAPTURE_PATTERN = /\u001b\[([0-9;]*)m/g

const ansiConverter = new AnsiToHtml({
  escapeXML: true,
})

export interface AnsiSgrState {
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
  inverse: boolean
  hidden: boolean
  strike: boolean
  fg: string | null
  bg: string | null
}

export function createAnsiSgrState(): AnsiSgrState {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    inverse: false,
    hidden: false,
    strike: false,
    fg: null,
    bg: null,
  }
}

export function hasAnsi(text: string): boolean {
  const normalized = normalizeAnsiText(text)
  return ANSI_SGR_PATTERN.test(normalized)
}

export function ansiToHtml(text: string): string {
  const normalized = normalizeAnsiText(text)
  const sanitized = stripNonSgrAnsi(normalized)
  return ansiConverter.toHtml(sanitized)
}

export function ansiChunkToHtml(chunk: string, state: AnsiSgrState) {
  const normalized = normalizeAnsiText(chunk)
  const sanitized = stripNonSgrAnsi(normalized)

  const prefix = sgrStateToEscapeSequence(state)
  const html = ansiConverter.toHtml(prefix + sanitized)
  const nextState = computeAnsiSgrState(sanitized, state)

  return { html, nextState }
}

export function computeAnsiSgrState(text: string, initialState?: AnsiSgrState): AnsiSgrState {
  const normalized = normalizeAnsiText(text)
  const sanitized = stripNonSgrAnsi(normalized)
  const nextState = cloneSgrState(initialState ?? createAnsiSgrState())

  for (const match of sanitized.matchAll(ANSI_SGR_CAPTURE_PATTERN)) {
    const params = match[1] ?? ""
    const codes = params.length === 0 ? [0] : params.split(";").map((part) => Number(part))
    applySgrCodes(nextState, codes)
  }

  return nextState
}

export function isAnsiSgrStateEmpty(state: AnsiSgrState): boolean {
  return (
    !state.bold &&
    !state.dim &&
    !state.italic &&
    !state.underline &&
    !state.inverse &&
    !state.hidden &&
    !state.strike &&
    state.fg === null &&
    state.bg === null
  )
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

function stripNonSgrAnsi(text: string): string {
  return text.replace(ANSI_NON_SGR_PATTERN, "")
}

function cloneSgrState(state: AnsiSgrState): AnsiSgrState {
  return { ...state }
}

function sgrStateToEscapeSequence(state: AnsiSgrState): string {
  if (isAnsiSgrStateEmpty(state)) {
    return ""
  }

  const codes: number[] = []
  if (state.bold) codes.push(1)
  if (state.dim) codes.push(2)
  if (state.italic) codes.push(3)
  if (state.underline) codes.push(4)
  if (state.inverse) codes.push(7)
  if (state.hidden) codes.push(8)
  if (state.strike) codes.push(9)

  if (state.fg) {
    codes.push(...state.fg.split(";").map((part) => Number(part)))
  }

  if (state.bg) {
    codes.push(...state.bg.split(";").map((part) => Number(part)))
  }

  if (codes.length === 0) {
    return ""
  }

  return `${ESC_CHAR}[${codes.join(";")}m`
}

function applySgrCodes(state: AnsiSgrState, codes: number[]) {
  for (let index = 0; index < codes.length; index++) {
    const code = codes[index]
    if (!Number.isFinite(code)) continue

    if (code === 0) {
      state.bold = false
      state.dim = false
      state.italic = false
      state.underline = false
      state.inverse = false
      state.hidden = false
      state.strike = false
      state.fg = null
      state.bg = null
      continue
    }

    if (code === 1) {
      state.bold = true
      continue
    }

    if (code === 2) {
      state.dim = true
      continue
    }

    if (code === 22) {
      state.bold = false
      state.dim = false
      continue
    }

    if (code === 3) {
      state.italic = true
      continue
    }

    if (code === 23) {
      state.italic = false
      continue
    }

    if (code === 4) {
      state.underline = true
      continue
    }

    if (code === 24) {
      state.underline = false
      continue
    }

    if (code === 7) {
      state.inverse = true
      continue
    }

    if (code === 27) {
      state.inverse = false
      continue
    }

    if (code === 8) {
      state.hidden = true
      continue
    }

    if (code === 28) {
      state.hidden = false
      continue
    }

    if (code === 9) {
      state.strike = true
      continue
    }

    if (code === 29) {
      state.strike = false
      continue
    }

    if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      state.fg = String(code)
      continue
    }

    if (code === 39) {
      state.fg = null
      continue
    }

    if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
      state.bg = String(code)
      continue
    }

    if (code === 49) {
      state.bg = null
      continue
    }

    if (code === 38 || code === 48) {
      const isForeground = code === 38
      const mode = codes[index + 1]
      if (!Number.isFinite(mode)) {
        continue
      }

      if (mode === 5) {
        const color = codes[index + 2]
        if (Number.isFinite(color)) {
          const value = `${code};5;${color}`
          if (isForeground) state.fg = value
          else state.bg = value
        }
        index += 2
        continue
      }

      if (mode === 2) {
        const r = codes[index + 2]
        const g = codes[index + 3]
        const b = codes[index + 4]
        if ([r, g, b].every((v) => Number.isFinite(v))) {
          const value = `${code};2;${r};${g};${b}`
          if (isForeground) state.fg = value
          else state.bg = value
        }
        index += 4
        continue
      }
    }
  }
}
