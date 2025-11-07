import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session } from "electron"
import { join } from "path"
import { createApplicationMenu } from "./menu"
import { setupInstanceIPC } from "./ipc"
import { setupStorageIPC } from "./storage"

const isMac = process.platform === "darwin"

if (isMac) {
  app.commandLine.appendSwitch("disable-spell-checking")
}

// Setup IPC handlers before creating windows
setupStorageIPC()

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const prefersDark = true //nativeTheme.shouldUseDarkColors
  const backgroundColor = prefersDark ? "#1a1a1a" : "#ffffff"

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: !isMac,
    },
  })

  if (isMac) {
    // Disable macOS spell server to avoid input lag
    mainWindow.webContents.session.setSpellCheckerEnabled(false)
  }

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:3000")
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }

  createApplicationMenu(mainWindow)
  setupInstanceIPC(mainWindow)

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

if (isMac) {
  app.on("web-contents-created", (_, contents) => {
    contents.session.setSpellCheckerEnabled(false)
  })
}

app.whenReady().then(() => {
  if (isMac) {
    session.defaultSession.setSpellCheckerEnabled(false)
    app.on("browser-window-created", (_, window) => {
      window.webContents.session.setSpellCheckerEnabled(false)
    })
  }

  console.log("[spellcheck] default session enabled:", session.defaultSession.isSpellCheckerEnabled())

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
