import { createContext, createSignal, useContext, onMount, createEffect, type JSX } from "solid-js"
import { storage, type ConfigData } from "./storage"

interface ThemeContextValue {
  isDark: () => boolean
  toggleTheme: () => void
  setTheme: (dark: boolean) => void
}

const ThemeContext = createContext<ThemeContextValue>()

function applyTheme(dark: boolean) {
  if (dark) {
    document.documentElement.setAttribute("data-theme", "dark")
    return
  }

  document.documentElement.removeAttribute("data-theme")
}

export function ThemeProvider(props: { children: JSX.Element }) {
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)")
  const [isDark, setIsDarkSignal] = createSignal(true) //systemPrefersDark.matches)
  let themePreference: "system" | "dark" | "light" = "dark"

  applyTheme(true) //systemPrefersDark.matches)

  async function loadTheme() {
    try {
      const config = await storage.loadConfig()
      const savedTheme = config.theme
      let themeDark: boolean

      if (savedTheme === "system") {
        themePreference = "system"
        themeDark = systemPrefersDark.matches
      } else if (savedTheme === "dark") {
        themePreference = "dark"
        themeDark = true
      } else if (savedTheme === "light") {
        themePreference = "light"
        themeDark = false
      } else {
        themePreference = "dark"
        themeDark = true
      }

      setIsDarkSignal(themeDark)
      applyTheme(themeDark)
    } catch (error) {
      console.warn("Failed to load theme from config:", error)
      themePreference = "dark"
      const themeDark = true
      setIsDarkSignal(themeDark)
      applyTheme(themeDark)
    }
  }

  async function saveTheme(dark: boolean) {
    try {
      const config = await storage.loadConfig()
      const nextPreference = dark ? "dark" : "light"
      config.theme = nextPreference
      themePreference = nextPreference
      await storage.saveConfig(config)
    } catch (error) {
      console.warn("Failed to save theme to config:", error)
    }
  }

  onMount(() => {
    loadTheme()

    const unsubscribe = storage.onConfigChanged(() => {
      loadTheme()
    })

    // Listen for system theme changes
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (themePreference === "system") {
        setIsDarkSignal(event.matches)
        applyTheme(event.matches)
      }
    }

    systemPrefersDark.addEventListener("change", handleSystemThemeChange)

    return () => {
      unsubscribe()
      systemPrefersDark.removeEventListener("change", handleSystemThemeChange)
    }
  })

  createEffect(() => {
    applyTheme(isDark())
  })

  const setTheme = (dark: boolean) => {
    setIsDarkSignal(dark)
    applyTheme(dark)
    saveTheme(dark)
  }

  const toggleTheme = () => {
    setTheme(!isDark())
  }

  return <ThemeContext.Provider value={{ isDark, toggleTheme, setTheme }}>{props.children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return context
}
