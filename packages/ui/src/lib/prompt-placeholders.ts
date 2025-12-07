import type { Attachment } from "../types/attachment"

export function resolvePastedPlaceholders(prompt: string, attachments: Attachment[] = []): string {
  if (!prompt || !prompt.includes("[pasted #")) {
    return prompt
  }

  if (!attachments || attachments.length === 0) {
    return prompt
  }

  const lookup = new Map<string, string>()

  for (const attachment of attachments) {
    const source = attachment?.source
    if (!source || source.type !== "text") continue
    const display = attachment?.display
    const value = source.value
    if (typeof display !== "string" || typeof value !== "string") continue
    const match = display.match(/pasted #(\d+)/)
    if (!match) continue
    const placeholder = `[pasted #${match[1]}]`
    if (!lookup.has(placeholder)) {
      lookup.set(placeholder, value)
    }
  }

  if (lookup.size === 0) {
    return prompt
  }

  return prompt.replace(/\[pasted #(\d+)\]/g, (fullMatch) => {
    const replacement = lookup.get(fullMatch)
    return typeof replacement === "string" ? replacement : fullMatch
  })
}
