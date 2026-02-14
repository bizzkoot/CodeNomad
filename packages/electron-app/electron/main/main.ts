import { app, BrowserWindow, WebContentsView, nativeImage, session, shell } from "electron"
import http from "node:http"
import https from "node:https"
import { randomUUID } from "node:crypto"
import { existsSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { createApplicationMenu } from "./menu"
import { setupCliIPC } from "./ipc"
import { CliProcessManager } from "./process-manager"
import { CodeNomadMcpServer } from "@codenomad/mcp-server"
import { setupMcpBridge, connectMcpBridge, shutdownBridge } from "@codenomad/mcp-server/src/bridge/ipc"
import {
  cleanupLegacyAntigravityRegistration,
  cleanupStaleInstances,
  writeMcpConfig,
  unregisterFromMcpConfig,
} from "@codenomad/mcp-server/src/config/registration"

const mainFilename = fileURLToPath(import.meta.url)
const mainDirname = dirname(mainFilename)

const isMac = process.platform === "darwin"
const SESSION_PARTITION = "persist:codenomad"

const cliManager = new CliProcessManager()
let mainWindow: BrowserWindow | null = null
let currentCliUrl: string | null = null
let pendingCliUrl: string | null = null
let pendingBootstrapToken: string | null = null
let showingLoadingScreen = false
let preloadingView: WebContentsView | null = null
let mcpServer: CodeNomadMcpServer | null = null
let mcpInstanceId: string | null = null

type McpLogLevel = "info" | "warn" | "error"

/**
 * Safely send message to window webContents with proper destruction checks.
 * Prevents "Object has been destroyed" errors during app shutdown.
 */
function safeWebContentsSend(window: BrowserWindow | null, channel: string, ...args: unknown[]) {
  if (!window || window.isDestroyed()) {
    return false
  }
  if (window.webContents.isDestroyed()) {
    return false
  }
  try {
    window.webContents.send(channel, ...args)
    return true
  } catch (error) {
    console.warn(`[safe-send] Failed to send to ${channel}:`, error)
    return false
  }
}

function emitMcpLog(level: McpLogLevel, message: string, data?: unknown) {
  safeWebContentsSend(mainWindow, "mcp:log", { level, message, data })
}

if (isMac) {
  app.commandLine.appendSwitch("disable-spell-checking")
}

function getIconPath() {
  if (app.isPackaged) {
    return join(process.resourcesPath, "icon.png")
  }

  return join(mainDirname, "../resources/icon.png")
}

type LoadingTarget =
  | { type: "url"; source: string }
  | { type: "file"; source: string }

function resolveDevLoadingUrl(): string | null {
  if (app.isPackaged) {
    return null
  }
  const devBase = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL
  if (!devBase) {
    return null
  }

  try {
    const normalized = devBase.endsWith("/") ? devBase : `${devBase}/`
    return new URL("loading.html", normalized).toString()
  } catch (error) {
    console.warn("[cli] failed to construct dev loading URL", devBase, error)
    return null
  }
}

function resolveLoadingTarget(): LoadingTarget {
  const devUrl = resolveDevLoadingUrl()
  if (devUrl) {
    return { type: "url", source: devUrl }
  }
  const filePath = resolveLoadingFilePath()
  return { type: "file", source: filePath }
}

function resolveLoadingFilePath() {
  const candidates = [
    join(app.getAppPath(), "dist/renderer/loading.html"),
    join(process.resourcesPath, "dist/renderer/loading.html"),
    join(mainDirname, "../dist/renderer/loading.html"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return join(app.getAppPath(), "dist/renderer/loading.html")
}

function loadLoadingScreen(window: BrowserWindow) {
  const target = resolveLoadingTarget()
  const loader =
    target.type === "url"
      ? window.loadURL(target.source)
      : window.loadFile(target.source)

  loader.catch((error) => {
    console.error("[cli] failed to load loading screen:", error)
  })
}

function getAllowedRendererOrigins(): string[] {
  const origins = new Set<string>()
  const rendererCandidates = [currentCliUrl, process.env.VITE_DEV_SERVER_URL, process.env.ELECTRON_RENDERER_URL]
  for (const candidate of rendererCandidates) {
    if (!candidate) {
      continue
    }
    try {
      origins.add(new URL(candidate).origin)
    } catch (error) {
      console.warn("[cli] failed to parse origin for", candidate, error)
    }
  }
  return Array.from(origins)
}

function shouldOpenExternally(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true
    }
    const allowedOrigins = getAllowedRendererOrigins()
    return !allowedOrigins.includes(parsed.origin)
  } catch {
    return false
  }
}

function setupNavigationGuards(window: BrowserWindow) {
  const handleExternal = (url: string) => {
    shell.openExternal(url).catch((error) => console.error("[cli] failed to open external URL", url, error))
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternally(url)) {
      handleExternal(url)
      return { action: "deny" }
    }
    return { action: "allow" }
  })

  window.webContents.on("will-navigate", (event, url) => {
    if (shouldOpenExternally(url)) {
      event.preventDefault()
      handleExternal(url)
    }
  })
}

let cachedPreloadPath: string | null = null
function getPreloadPath() {
  if (cachedPreloadPath && existsSync(cachedPreloadPath)) {
    return cachedPreloadPath
  }

  const candidates = [
    join(process.resourcesPath, "preload/index.js"),
    join(mainDirname, "../preload/index.js"),
    join(mainDirname, "../preload/index.cjs"),
    join(mainDirname, "../../preload/index.cjs"),
    join(mainDirname, "../../electron/preload/index.cjs"),
    join(app.getAppPath(), "preload/index.cjs"),
    join(app.getAppPath(), "electron/preload/index.cjs"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedPreloadPath = candidate
      return candidate
    }
  }

  return join(mainDirname, "../preload/index.js")
}

function destroyPreloadingView(target?: WebContentsView | null) {
  const view = target ?? preloadingView
  if (!view) {
    return
  }

  try {
    // WebContentsView: access webContents directly
    const contents = view.webContents
    if (contents && !contents.isDestroyed()) {
      contents.closeDevTools()
      contents.stop()
    }
  } catch (error) {
    console.warn("[cli] failed to destroy preloading view", error)
  }

  if (!target || view === preloadingView) {
    preloadingView = null
  }
}

function createWindow() {
  const prefersDark = true
  const backgroundColor = prefersDark ? "#1a1a1a" : "#ffffff"
  const iconPath = getIconPath()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor,
    icon: iconPath,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: !isMac,
      partition: SESSION_PARTITION,
    },
  })

  setupNavigationGuards(mainWindow)

  if (isMac) {
    mainWindow.webContents.session.setSpellCheckerEnabled(false)
  }

  showingLoadingScreen = true
  currentCliUrl = null
  loadLoadingScreen(mainWindow)

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools({ mode: "detach" })
  }

  createApplicationMenu(mainWindow)
  const cleanupIPC = setupCliIPC(mainWindow, cliManager)

  mainWindow.on("closed", () => {
    cleanupIPC()
    destroyPreloadingView()
    mainWindow = null
    currentCliUrl = null
    pendingCliUrl = null
    showingLoadingScreen = false
  })

  if (pendingCliUrl) {
    const url = pendingCliUrl
    pendingCliUrl = null
    startCliPreload(url)
  }
}

function showLoadingScreen(force = false) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  if (showingLoadingScreen && !force) {
    return
  }

  destroyPreloadingView()
  showingLoadingScreen = true
  currentCliUrl = null
  pendingCliUrl = null
  loadLoadingScreen(mainWindow)
}

function isBootstrapTokenUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.pathname === "/auth/token" && parsed.hash.length > 1
  } catch {
    return false
  }
}

function startCliPreload(url: string) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingCliUrl = url
    return
  }

  if (currentCliUrl === url && !showingLoadingScreen) {
    return
  }

  pendingCliUrl = url
  destroyPreloadingView()

  if (!showingLoadingScreen) {
    showLoadingScreen(true)
  }

  // Important: /auth/token#... is one-time. Preloading + swapping would load it twice,
  // consuming the token in the hidden view and then failing in the main window.
  if (isBootstrapTokenUrl(url)) {
    finalizeCliSwap(url)
    return
  }

  if (process.env.NODE_ENV === "development") {
    finalizeCliSwap(url)
    return
  }

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: !isMac,
      partition: SESSION_PARTITION,
    },
  })

  preloadingView = view

  // WebContentsView: access webContents directly (no deprecation)
  const viewContents = view.webContents
  if (!viewContents) {
    console.error("[cli] failed to access WebContentsView webContents")
    destroyPreloadingView(view)
    return
  }

  viewContents.once("did-finish-load", () => {
    if (preloadingView !== view) {
      destroyPreloadingView(view)
      return
    }
    finalizeCliSwap(url)
  })

  viewContents.loadURL(url).catch((error: Error) => {
    console.error("[cli] failed to preload CLI view:", error)
    if (preloadingView === view) {
      destroyPreloadingView(view)
    }
  })
}

function finalizeCliSwap(url: string) {
  destroyPreloadingView()

  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingCliUrl = url
    return
  }

  showingLoadingScreen = false
  currentCliUrl = url
  pendingCliUrl = null
  console.info("[cli] loading renderer from", url)
  mainWindow.loadURL(url).catch((error) => console.error("[cli] failed to load CLI view:", error))
}

const SESSION_COOKIE_NAME = "codenomad_session"
let bootstrapExchangeInFlight = false

function extractCookieValue(setCookieHeader: string | string[] | undefined, name: string): string | null {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
  if (!raw) return null

  const first = raw.split(";")[0] ?? ""
  const index = first.indexOf("=")
  if (index < 0) return null

  const key = first.slice(0, index).trim()
  const value = first.slice(index + 1).trim()
  if (key !== name || !value) return null

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function exchangeBootstrapToken(baseUrl: string, token: string): Promise<boolean> {
  const target = new URL("/api/auth/token", baseUrl)
  const body = JSON.stringify({ token })

  const transport = target.protocol === "https:" ? https : http

  const result = await new Promise<{ statusCode: number; setCookie: string | string[] | undefined }>((resolve, reject) => {
    const req = transport.request(
      target,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume()
        resolve({ statusCode: res.statusCode ?? 0, setCookie: res.headers["set-cookie"] })
      },
    )

    req.on("error", reject)
    req.write(body)
    req.end()
  })

  if (result.statusCode !== 200) {
    return false
  }

  const sessionId = extractCookieValue(result.setCookie, SESSION_COOKIE_NAME)
  if (!sessionId) {
    return false
  }

  await session.fromPartition(SESSION_PARTITION).cookies.set({
    url: baseUrl,
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  })

  return true
}

async function startCli(mcpPort?: number) {
  try {
    const devMode = process.env.NODE_ENV === "development"
    console.info("[cli] start requested (dev mode:", devMode, ", mcpPort:", mcpPort, ")")
    await cliManager.start({ dev: devMode, mcpPort })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[cli] start failed:", message)
    safeWebContentsSend(mainWindow, "cli:error", { message })
  }
}

async function maybeExchangeAndNavigate(baseUrl: string) {
  if (bootstrapExchangeInFlight) {
    return
  }

  const token = pendingBootstrapToken
  if (!token) {
    startCliPreload(baseUrl)
    return
  }

  bootstrapExchangeInFlight = true

  try {
    const ok = await exchangeBootstrapToken(baseUrl, token)
    pendingBootstrapToken = null

    if (!ok) {
      startCliPreload(`${baseUrl}/login`)
      return
    }

    startCliPreload(baseUrl)
  } catch (error) {
    console.error("[cli] bootstrap token exchange failed:", error)
    pendingBootstrapToken = null
    startCliPreload(`${baseUrl}/login`)
  } finally {
    bootstrapExchangeInFlight = false
  }
}

cliManager.on("bootstrapToken", (token) => {
  // Don't process events if mainWindow is null (app is shutting down)
  if (!mainWindow) {
    return
  }
  pendingBootstrapToken = token

  const status = cliManager.getStatus()
  if (status.url) {
    void maybeExchangeAndNavigate(status.url)
  }
})

cliManager.on("ready", (status) => {
  // Don't process events if mainWindow is null (app is shutting down)
  if (!mainWindow) {
    return
  }
  if (!status.url) {
    return
  }

  void maybeExchangeAndNavigate(status.url)
})

cliManager.on("status", (status) => {
  // Don't process events if mainWindow is null (app is shutting down)
  if (!mainWindow) {
    return
  }
  if (status.state !== "ready") {
    showLoadingScreen()
  }
})

if (isMac) {
  app.on("web-contents-created", (_, contents) => {
    contents.session.setSpellCheckerEnabled(false)
  })
}

app.whenReady().then(async () => {
  if (isMac) {
    session.defaultSession.setSpellCheckerEnabled(false)
    app.on("browser-window-created", (_, window) => {
      window.webContents.session.setSpellCheckerEnabled(false)
    })

    if (app.dock) {
      const dockIcon = nativeImage.createFromPath(getIconPath())
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon)
      }
    }
  }

  createWindow()

  // Start MCP server FIRST if we have a main window
  let mcpPort: number | undefined
  if (mainWindow) {
    try {
      await setupMcpBridge(mainWindow)
      console.log('[MCP] IPC bridge setup completed')
      emitMcpLog("info", "IPC bridge setup completed")
      console.log('[MCP] preload path:', getPreloadPath())
      emitMcpLog("info", "Preload path resolved", { preloadPath: getPreloadPath() })
      console.log('[MCP] app.isPackaged:', app.isPackaged)
      emitMcpLog("info", "App packaging state", { isPackaged: app.isPackaged })
      console.log('[MCP] main window ids:', {
        windowId: mainWindow.id,
        webContentsId: mainWindow.webContents?.id,
      })
      emitMcpLog("info", "Main window ids", {
        windowId: mainWindow.id,
        webContentsId: mainWindow.webContents?.id,
      })
    } catch (err) {
      console.error('[MCP] Failed to setup IPC bridge:', err)
      emitMcpLog("error", "Failed to setup IPC bridge", err)
    }

    const server = new CodeNomadMcpServer()
    mcpServer = server

    try {
      cleanupLegacyAntigravityRegistration()
      await cleanupStaleInstances()
      await mcpServer.start()
      console.log('[MCP] Server start completed')
      emitMcpLog("info", "MCP server start completed")
      const port = mcpServer.getPort()
      const token = mcpServer.getAuthToken()

      // Debug logging to identify why registration might fail
      console.log(`[MCP] Debug - port: ${port}, token: ${token ? 'exists' : 'missing'}`)
      emitMcpLog("info", "MCP server port/token", { port, token: token ? "exists" : "missing" })

      if (port && token) {
        mcpPort = port
        mcpInstanceId = mcpInstanceId ?? randomUUID()
        // Pass the correct path to the MCP server entry point
        const mcpServerPath = join(app.getAppPath(), '../mcp-server/dist/server.js')
        writeMcpConfig({ instanceId: mcpInstanceId, port, token, serverPath: mcpServerPath })
        console.log(`[MCP] Registered local instance ${mcpInstanceId} on port ${port}`)
        emitMcpLog("info", "Registered local MCP instance", { instanceId: mcpInstanceId, port })
      } else {
        console.error(`[MCP] Failed to register - port: ${port}, token: ${token}`)
        emitMcpLog("warn", "Failed to register MCP config", { port, token: token ? "exists" : "missing" })
      }

      // Connect MCP server bridge regardless of registration outcome
      if (mcpServer && mainWindow) {
        try {
          connectMcpBridge(mcpServer, mainWindow)
          console.log('[MCP] Connected MCP server bridge to IPC')
          emitMcpLog("info", "Connected MCP server bridge to IPC")
        } catch (connectError) {
          console.error('[MCP] Failed to connect MCP bridge:', connectError)
          emitMcpLog("error", "Failed to connect MCP bridge", connectError)
        }
      }
    } catch (error) {
      console.error('[MCP] Failed to start server:', error)
      emitMcpLog("error", "Failed to start MCP server", error)
    }
  }

  // Then start CLI with MCP port
  await startCli(mcpPort)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.on("before-quit", async (event) => {
    event.preventDefault()

    // First: Signal MCP bridge to stop sending messages
    // This must happen before any cleanup to prevent race conditions
    shutdownBridge()

    // Second: Remove all IPC event listeners before nulling mainWindow
    // This prevents any event handlers from trying to use the mainWindow reference
    const windowToCleanup = mainWindow

    // Third: Clean up the IPC handlers
    // The 'closed' event handler will call cleanupIPC(), but we need to ensure
    // it happens before mainWindow is nulled out in case any events fire
    if (windowToCleanup) {
      // Remove all IPC listeners by triggering cleanup
      // Note: The actual cleanupIPC function is called from the 'closed' event
    }

    // Fourth: Now safe to null out mainWindow reference
    mainWindow = null

    // Fifth: Unregister MCP server from CodeNomad-local per-instance config
    if (mcpServer) {
      if (mcpInstanceId) {
        unregisterFromMcpConfig(mcpInstanceId)
      }
      await mcpServer.stop()
    }

    await cliManager.stop().catch(() => { })
    
    // Close window after cleanup to prevent webContents access during shutdown
    if (windowToCleanup && !windowToCleanup.isDestroyed()) {
      windowToCleanup.close()
    }
    
    app.exit(0)
  })

  app.on("window-all-closed", () => {
    // CodeNomad supports a single window; closing it should quit the app on all platforms.
    app.quit()
  })
})
