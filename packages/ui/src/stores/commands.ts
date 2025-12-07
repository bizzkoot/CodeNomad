import { createSignal } from "solid-js"
import type { Command as SDKCommand } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk/client"

const [commandMap, setCommandMap] = createSignal<Map<string, SDKCommand[]>>(new Map())

export async function fetchCommands(instanceId: string, client: OpencodeClient): Promise<void> {
  const response = await client.command.list()
  const commands = response.data ?? []
  setCommandMap((prev) => {
    const next = new Map(prev)
    next.set(instanceId, commands)
    return next
  })
}

export function getCommands(instanceId: string): SDKCommand[] {
  return commandMap().get(instanceId) ?? []
}

export function clearCommands(instanceId: string): void {
  setCommandMap((prev) => {
    if (!prev.has(instanceId)) return prev
    const next = new Map(prev)
    next.delete(instanceId)
    return next
  })
}

export { commandMap as commands }
