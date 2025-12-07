import { createContext, createEffect, createSignal, onMount, useContext, type JSX } from "solid-js"
import { useConfig } from "../stores/preferences"

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
  const { themePreference, setThemePreference } = useConfig()
  const [isDark, setIsDarkSignal] = createSignal(true)

  const resolveDarkTheme = () => {
    themePreference()
    return true
  }

  const applyResolvedTheme = () => {
    const dark = resolveDarkTheme()
    setIsDarkSignal(dark)
    applyTheme(dark)
  }

  createEffect(() => {
    applyResolvedTheme()
  })

  onMount(() => {
    const handleSystemThemeChange = () => {
      applyResolvedTheme()
    }

    systemPrefersDark.addEventListener("change", handleSystemThemeChange)

    return () => {
      systemPrefersDark.removeEventListener("change", handleSystemThemeChange)
    }
  })

  const setTheme = (_dark: boolean) => {
    setThemePreference("dark")
  }

  const toggleTheme = () => {
    setTheme(true)
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
