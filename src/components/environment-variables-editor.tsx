import { Component, createSignal, For, Show } from "solid-js"
import { Plus, Trash2, Key, Globe } from "lucide-solid"
import {
  preferences,
  addEnvironmentVariable,
  removeEnvironmentVariable,
  updateEnvironmentVariables,
} from "../stores/preferences"

interface EnvironmentVariablesEditorProps {
  disabled?: boolean
}

const EnvironmentVariablesEditor: Component<EnvironmentVariablesEditorProps> = (props) => {
  const [envVars, setEnvVars] = createSignal<Record<string, string>>(preferences().environmentVariables || {})
  const [newKey, setNewKey] = createSignal("")
  const [newValue, setNewValue] = createSignal("")

  const entries = () => Object.entries(envVars())

  function handleAddVariable() {
    const key = newKey().trim()
    const value = newValue().trim()

    if (!key) return

    addEnvironmentVariable(key, value)
    setEnvVars({ ...envVars(), [key]: value })
    setNewKey("")
    setNewValue("")
  }

  function handleRemoveVariable(key: string) {
    removeEnvironmentVariable(key)
    const { [key]: removed, ...rest } = envVars()
    setEnvVars(rest)
  }

  function handleUpdateVariable(key: string, value: string) {
    const updated = { ...envVars(), [key]: value }
    setEnvVars(updated)
    updateEnvironmentVariables(updated)
  }

  function handleKeyPress(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleAddVariable()
    }
  }

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-2 mb-3">
        <Globe class="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Environment Variables</span>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          ({entries().length} variable{entries().length !== 1 ? "s" : ""})
        </span>
      </div>

      {/* Existing variables */}
      <Show when={entries().length > 0}>
        <div class="space-y-2">
          <For each={entries()}>
            {([key, value]) => (
              <div class="flex items-center gap-2">
                <div class="flex-1 flex items-center gap-2">
                  <Key class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <input
                    type="text"
                    value={key}
                    disabled={props.disabled}
                    class="flex-1 px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    placeholder="Variable name"
                    title="Variable name (read-only)"
                  />
                  <input
                    type="text"
                    value={value}
                    disabled={props.disabled}
                    onInput={(e) => handleUpdateVariable(key, e.currentTarget.value)}
                    class="flex-1 px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Variable value"
                  />
                </div>
                <button
                  onClick={() => handleRemoveVariable(key)}
                  disabled={props.disabled}
                  class="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Remove variable"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Add new variable */}
      <div class="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
        <div class="flex-1 flex items-center gap-2">
          <Key class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            type="text"
            value={newKey()}
            onInput={(e) => setNewKey(e.currentTarget.value)}
            onKeyPress={handleKeyPress}
            disabled={props.disabled}
            class="flex-1 px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Variable name"
          />
          <input
            type="text"
            value={newValue()}
            onInput={(e) => setNewValue(e.currentTarget.value)}
            onKeyPress={handleKeyPress}
            disabled={props.disabled}
            class="flex-1 px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Variable value"
          />
        </div>
        <button
          onClick={handleAddVariable}
          disabled={props.disabled || !newKey().trim()}
          class="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Add variable"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <Show when={entries().length === 0}>
        <div class="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
          No environment variables configured. Add variables above to customize the OpenCode environment.
        </div>
      </Show>

      <div class="text-xs text-gray-500 dark:text-gray-400 mt-2">
        These variables will be available in the OpenCode environment when starting instances.
      </div>
    </div>
  )
}

export default EnvironmentVariablesEditor
