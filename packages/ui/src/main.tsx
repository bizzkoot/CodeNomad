import { render } from "solid-js/web"
import App from "./App"
import { ThemeProvider } from "./lib/theme"
import { ConfigProvider } from "./stores/preferences"
import { InstanceConfigProvider } from "./stores/instance-config"
import { runtimeEnv } from "./lib/runtime-env"
import { preloadAllNotifications } from "./stores/failed-notifications"
import { I18nProvider } from "./lib/i18n"
import { storage } from "./lib/storage"
import "./index.css"
import "@git-diff-view/solid/styles/diff-view-pure.css"

const root = document.getElementById("root")

if (!root) {
  throw new Error("Root element not found")
}

const mount = root

if (typeof document !== "undefined") {
  document.documentElement.dataset.runtimeHost = runtimeEnv.host
  document.documentElement.dataset.runtimePlatform = runtimeEnv.platform

  // Preload failed notifications from localStorage BEFORE app renders
  if (import.meta.env.DEV) {
    console.log("[Main.tsx] Calling preloadAllNotifications()...")
  }
  preloadAllNotifications()
  if (import.meta.env.DEV) {
    console.log("[Main.tsx] preloadAllNotifications() call completed")
  }
}

async function bootstrap() {
  if (typeof document !== "undefined") {
    // renderer/index.html currently seeds a dark theme to avoid a white flash.
    // Reset to CSS defaults immediately so the first render matches system
    // (and then refine once persisted config loads).
    document.documentElement.removeAttribute("data-theme")

    try {
      const config = await storage.loadConfig()
      const theme = config?.theme ?? "system"

      if (theme === "system") {
        document.documentElement.removeAttribute("data-theme")
      } else {
        document.documentElement.setAttribute("data-theme", theme)
      }
    } catch {
      // If config fails to load, fall back to CSS defaults.
    }
  }

  render(
    () => (
      <ConfigProvider>
        <InstanceConfigProvider>
          <I18nProvider>
            <ThemeProvider>
              <App />
            </ThemeProvider>
          </I18nProvider>
        </InstanceConfigProvider>
      </ConfigProvider>
    ),
    mount,
  )
}

void bootstrap()
