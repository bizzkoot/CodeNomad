export interface Message {
  id: string
  sessionId: string
  type: "user" | "assistant"
  parts: any[]
  timestamp: number
  status: "sending" | "sent" | "streaming" | "complete" | "error"
}
