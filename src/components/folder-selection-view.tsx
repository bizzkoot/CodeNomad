import { Component, createSignal, Show, For, onMount, onCleanup, createEffect } from "solid-js"
import { Folder, Clock, Trash2, FolderPlus, Settings, ChevronDown, ChevronUp } from "lucide-solid"
import { recentFolders, removeRecentFolder, preferences, updateLastUsedBinary } from "../stores/preferences"
import OpenCodeBinarySelector from "./opencode-binary-selector"
import EnvironmentVariablesEditor from "./environment-variables-editor"

interface FolderSelectionViewProps {
  onSelectFolder: (folder?: string, binaryPath?: string) => void
  isLoading?: boolean
}

const FolderSelectionView: Component<FolderSelectionViewProps> = (props) => {
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [focusMode, setFocusMode] = createSignal<"recent" | "new" | null>("recent")
  const [showAdvanced, setShowAdvanced] = createSignal(false)
  const [selectedBinary, setSelectedBinary] = createSignal(preferences().lastUsedBinary || "opencode")

  const folders = () => recentFolders()

  // Update selected binary when preferences change
  createEffect(() => {
    const lastUsed = preferences().lastUsedBinary
    if (lastUsed && lastUsed !== selectedBinary()) {
      setSelectedBinary(lastUsed)
    }
  })

  function scrollToIndex(index: number) {
    const element = document.querySelector(`[data-folder-index="${index}"]`)
    if (element) {
      element.scrollIntoView({ block: "nearest", behavior: "auto" })
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const folderList = folders()

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleBrowse()
      return
    }

    if (folderList.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      const newIndex = Math.min(selectedIndex() + 1, folderList.length - 1)
      setSelectedIndex(newIndex)
      setFocusMode("recent")
      scrollToIndex(newIndex)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const newIndex = Math.max(selectedIndex() - 1, 0)
      setSelectedIndex(newIndex)
      setFocusMode("recent")
      scrollToIndex(newIndex)
    } else if (e.key === "PageDown") {
      e.preventDefault()
      const pageSize = 5
      const newIndex = Math.min(selectedIndex() + pageSize, folderList.length - 1)
      setSelectedIndex(newIndex)
      setFocusMode("recent")
      scrollToIndex(newIndex)
    } else if (e.key === "PageUp") {
      e.preventDefault()
      const pageSize = 5
      const newIndex = Math.max(selectedIndex() - pageSize, 0)
      setSelectedIndex(newIndex)
      setFocusMode("recent")
      scrollToIndex(newIndex)
    } else if (e.key === "Home") {
      e.preventDefault()
      setSelectedIndex(0)
      setFocusMode("recent")
      scrollToIndex(0)
    } else if (e.key === "End") {
      e.preventDefault()
      const newIndex = folderList.length - 1
      setSelectedIndex(newIndex)
      setFocusMode("recent")
      scrollToIndex(newIndex)
    } else if (e.key === "Enter") {
      e.preventDefault()
      handleEnterKey()
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault()
      if (folderList.length > 0 && focusMode() === "recent") {
        const folder = folderList[selectedIndex()]
        if (folder) {
          handleRemove(folder.path)
        }
      }
    }
  }

  function handleEnterKey() {
    const folderList = folders()
    const index = selectedIndex()

    if (index < folderList.length) {
      props.onSelectFolder(folderList[index].path)
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown)
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown)
    })
  })

  function formatRelativeTime(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return "just now"
  }

  function handleFolderSelect(path: string) {
    updateLastUsedBinary(selectedBinary())
    props.onSelectFolder(path, selectedBinary())
  }

  function handleBrowse() {
    updateLastUsedBinary(selectedBinary())
    props.onSelectFolder(undefined, selectedBinary())
  }

  function handleBinaryChange(binary: string) {
    setSelectedBinary(binary)
  }

  function handleRemove(path: string, e?: Event) {
    e?.stopPropagation()
    removeRecentFolder(path)

    const folderList = folders()
    if (selectedIndex() >= folderList.length && folderList.length > 0) {
      setSelectedIndex(folderList.length - 1)
    }
  }

  function getDisplayPath(path: string): string {
    if (path.startsWith("/Users/")) {
      return path.replace(/^\/Users\/[^/]+/, "~")
    }
    return path
  }

  return (
    <div class="flex h-full w-full items-center justify-center" style="background-color: var(--surface-secondary)">
      <div class="w-full max-w-3xl px-8 py-12">
        <div class="mb-8 text-center">
          <div class="mb-4 flex justify-center">
            <Folder class="h-16 w-16" style="color: var(--text-muted)" />
          </div>
          <h1 class="mb-2 text-2xl font-semibold" style="color: var(--text-primary)">Welcome to OpenCode</h1>
          <p class="text-base" style="color: var(--text-secondary)">Select a folder to start coding with AI</p>
        </div>

        <div class="space-y-4 overflow-visible">
          <Show
            when={folders().length > 0}
            fallback={
              <div class="panel panel-empty-state">
                <div class="panel-empty-state-icon">
                  <Clock class="w-12 h-12 mx-auto" />
                </div>
                <p class="panel-empty-state-title">No Recent Folders</p>
                <p class="panel-empty-state-description">Browse for a folder to get started</p>
              </div>
            }
          >
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">Recent Folders</h2>
                <p class="panel-subtitle">
                  {folders().length} {folders().length === 1 ? "folder" : "folders"} available
                </p>
              </div>
              <div class="panel-list">
                <For each={folders()}>
                  {(folder, index) => (
                    <div 
                      class="panel-list-item w-full"
                      classList={{
                        "panel-list-item-highlight": focusMode() === "recent" && selectedIndex() === index(),
                      }}
                    >
                      <div class="flex items-center w-full">
                        <button
                          class="panel-list-item-content flex-1 w-full"
                          onClick={() => handleFolderSelect(folder.path)}
                          onMouseEnter={() => {
                            setFocusMode("recent")
                            setSelectedIndex(index())
                          }}
                        >
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                              <Folder class="w-4 h-4 flex-shrink-0" style="color: var(--text-muted)" />
                              <span class="text-sm font-medium truncate" style="color: var(--text-primary)">
                                {folder.path.split("/").pop()}
                              </span>
                            </div>
                            <div class="text-xs font-mono truncate pl-6" style="color: var(--text-muted)">
                              {getDisplayPath(folder.path)}
                            </div>
                            <div class="text-xs mt-1 pl-6" style="color: var(--text-muted)">
                              {formatRelativeTime(folder.lastAccessed)}
                            </div>
                          </div>
                          <Show when={focusMode() === "recent" && selectedIndex() === index()}>
                            <kbd class="kbd">
                              ↵ 
                            </kbd>
                          </Show>
                        </button>
                        <button
                          onClick={(e) => handleRemove(folder.path, e)}
                          class="opacity-0 group-hover:opacity-100 p-2.5 transition-all mr-2 hover:bg-red-100 dark:hover:bg-red-900/30"
                          title="Remove from recent"
                        >
                          <Trash2 class="w-3.5 h-3.5 transition-colors" style="color: var(--text-muted)" 
                            classList={{ "hover:text-red-600": true, "dark:hover:text-red-400": true }} />
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Browse for Folder</h2>
              <p class="panel-subtitle">Select any folder on your computer</p>
            </div>

            <div class="panel-body">
              <button
                onClick={handleBrowse}
                disabled={props.isLoading}
                class={`w-full px-4 py-2.5 rounded-lg transition-all font-medium flex items-center justify-between text-sm disabled:cursor-not-allowed ${props.isLoading ? "selector-button-secondary disabled" : "selector-button-primary"}`}
                onMouseEnter={() => setFocusMode("new")}
              >
                <div class="flex items-center gap-2 flex-1 justify-center">
                  <FolderPlus class="w-4 h-4" />
                  <span>{props.isLoading ? "Opening..." : "Browse Folders"}</span>
                </div>
                <kbd class="kbd">
                  Cmd+Enter
                </kbd>
              </button>
            </div>

            {/* Advanced settings section */}
            <div class="panel-section">
              <button
                onClick={() => setShowAdvanced(!showAdvanced())}
                class="panel-section-header"
              >
                <div class="flex items-center gap-2">
                  <Settings class="w-4 h-4" style="color: var(--text-muted)" />
                  <span class="text-sm font-medium" style="color: var(--text-secondary)">Advanced Settings</span>
                </div>
                {showAdvanced() ? (
                  <ChevronUp class="w-4 h-4" style="color: var(--text-muted)" />
                ) : (
                  <ChevronDown class="w-4 h-4" style="color: var(--text-muted)" />
                )}
              </button>

              <Show when={showAdvanced()}>
                <div class="panel-section-content">
                  <div>
                    <div class="text-sm font-medium mb-2" style="color: var(--text-secondary)">OpenCode Binary</div>
                    <OpenCodeBinarySelector
                      selectedBinary={selectedBinary()}
                      onBinaryChange={handleBinaryChange}
                      disabled={props.isLoading}
                    />
                  </div>

                  <div>
                    <EnvironmentVariablesEditor disabled={props.isLoading} />
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </div>

        <div class="mt-6 panel panel-footer">
          <div class="panel-footer-hints">
            <Show when={folders().length > 0}>
              <div class="flex items-center gap-1.5">
                <kbd class="kbd">↑</kbd>
                <kbd class="kbd">↓</kbd>
                <span>Navigate</span>
              </div>
              <div class="flex items-center gap-1.5">
                <kbd class="kbd">Enter</kbd>
                <span>Select</span>
              </div>
              <div class="flex items-center gap-1.5">
                <kbd class="kbd">Del</kbd>
                <span>Remove</span>
              </div>
            </Show>
            <div class="flex items-center gap-1.5">
              <kbd class="kbd">Cmd+Enter</kbd>
              <span>Browse</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FolderSelectionView
