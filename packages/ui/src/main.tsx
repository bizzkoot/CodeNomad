import { render } from "solid-js/web"
import App from "./App"
import { ThemeProvider } from "./lib/theme"
import { ConfigProvider } from "./stores/preferences"
import { InstanceConfigProvider } from "./stores/instance-config"
import { runtimeEnv } from "./lib/runtime-env"
import { preloadAllNotifications } from "./stores/failed-notifications"
import "./index.css"
import "@git-diff-view/solid/styles/diff-view-pure.css"

const root = document.getElementById("root")

if (!root) {
  throw new Error("Root element not found")
}

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

if (typeof document !== "undefined") {
  document.documentElement.dataset.runtimeHost = runtimeEnv.host
  document.documentElement.dataset.runtimePlatform = runtimeEnv.platform
  
  // Preload failed notifications from localStorage on app startup
  preloadAllNotifications()
}

render(
  () => (
    <ConfigProvider>
      <InstanceConfigProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </InstanceConfigProvider>
    </ConfigProvider>
  ),
  root,
)
