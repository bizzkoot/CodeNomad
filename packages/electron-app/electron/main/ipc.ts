import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron"
import type { CliProcessManager, CliStatus } from "./process-manager"

interface DialogOpenRequest {
  mode: "directory" | "file"
  title?: string
  defaultPath?: string
  filters?: Array<{ name?: string; extensions: string[] }>
}

interface DialogOpenResult {
  canceled: boolean
  paths: string[]
}

/**
 * Safely send message to window webContents with proper destruction checks.
 * Prevents "Object has been destroyed" errors during app shutdown.
 */
function safeWebContentsSend(window: BrowserWindow, channel: string, ...args: unknown[]) {
  if (window.isDestroyed()) {
    return false
  }
  if (window.webContents.isDestroyed()) {
    return false
  }
  try {
    window.webContents.send(channel, ...args)
    return true
  } catch (error) {
    console.warn(`[ipc] Failed to send to ${channel}:`, error)
    return false
  }
}

export function setupCliIPC(mainWindow: BrowserWindow, cliManager: CliProcessManager) {
  // Define listeners
  const onStatus = (status: CliStatus) => {
    safeWebContentsSend(mainWindow, "cli:status", status)
  }

  const onReady = (status: CliStatus) => {
    safeWebContentsSend(mainWindow, "cli:ready", status)
  }

  const onError = (error: Error) => {
    safeWebContentsSend(mainWindow, "cli:error", { message: error.message })
  }

  // Register listeners
  cliManager.on("status", onStatus)
  cliManager.on("ready", onReady)
  cliManager.on("error", onError)

  // Clean up existing handlers if any (though usually we clean up on window close)
  ipcMain.removeHandler("cli:getStatus")
  ipcMain.removeHandler("cli:restart")
  ipcMain.removeHandler("dialog:open")

  ipcMain.handle("cli:getStatus", async () => cliManager.getStatus())

  ipcMain.handle("cli:restart", async () => {
    const devMode = process.env.NODE_ENV === "development"
    await cliManager.stop()
    return cliManager.start({ dev: devMode })
  })

  ipcMain.handle("dialog:open", async (_, request: DialogOpenRequest): Promise<DialogOpenResult> => {
    const properties: OpenDialogOptions["properties"] =
      request.mode === "directory" ? ["openDirectory", "createDirectory"] : ["openFile"]

    const filters = request.filters?.map((filter) => ({
      name: filter.name ?? "Files",
      extensions: filter.extensions,
    }))

    const windowTarget = mainWindow.isDestroyed() ? undefined : mainWindow
    const dialogOptions: OpenDialogOptions = {
      title: request.title,
      defaultPath: request.defaultPath,
      properties,
      filters,
    }
    const result = windowTarget
      ? await dialog.showOpenDialog(windowTarget, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    return { canceled: result.canceled, paths: result.filePaths }
  })

  // Return cleanup function
  return () => {
    cliManager.removeListener("status", onStatus)
    cliManager.removeListener("ready", onReady)
    cliManager.removeListener("error", onError)

    ipcMain.removeHandler("cli:getStatus")
    ipcMain.removeHandler("cli:restart")
    ipcMain.removeHandler("dialog:open")
  }
}

