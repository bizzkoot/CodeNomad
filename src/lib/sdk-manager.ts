import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/client"

class SDKManager {
  private clients = new Map<number, OpencodeClient>()

  createClient(port: number): OpencodeClient {
    if (this.clients.has(port)) {
      return this.clients.get(port)!
    }

    const client = createOpencodeClient({
      baseUrl: `http://localhost:${port}`,
    })

    this.clients.set(port, client)
    return client
  }

  getClient(port: number): OpencodeClient | null {
    return this.clients.get(port) || null
  }

  destroyClient(port: number): void {
    this.clients.delete(port)
  }

  destroyAll(): void {
    this.clients.clear()
  }
}

export const sdkManager = new SDKManager()
