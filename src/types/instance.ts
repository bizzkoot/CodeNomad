import type { OpencodeClient } from "@opencode-ai/sdk/client"

export interface Instance {
  id: string
  folder: string
  port: number
  pid: number
  status: "starting" | "ready" | "error" | "stopped"
  error?: string
  client: OpencodeClient | null
}

export interface LogEntry {
  timestamp: number
  level: "info" | "error"
  message: string
}
