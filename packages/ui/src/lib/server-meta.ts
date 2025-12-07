import type { ServerMeta } from "../../../server/src/api-types"
import { serverApi } from "./api-client"

let cachedMeta: ServerMeta | null = null
let pendingMeta: Promise<ServerMeta> | null = null

export async function getServerMeta(forceRefresh = false): Promise<ServerMeta> {
  if (cachedMeta && !forceRefresh) {
    return cachedMeta
  }
  if (pendingMeta) {
    return pendingMeta
  }
  pendingMeta = serverApi.fetchServerMeta().then((meta) => {
    cachedMeta = meta
    pendingMeta = null
    return meta
  })
  return pendingMeta
}
