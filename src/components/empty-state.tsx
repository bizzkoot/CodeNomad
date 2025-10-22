import { Component } from "solid-js"
import { Folder, Loader2 } from "lucide-solid"

interface EmptyStateProps {
  onSelectFolder: () => void
  isLoading?: boolean
}

const EmptyState: Component<EmptyStateProps> = (props) => {
  return (
    <div class="flex h-full w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div class="max-w-[500px] px-8 py-12 text-center">
        <div class="mb-8 flex justify-center">
          <Folder class="h-16 w-16 text-gray-400 dark:text-gray-600" />
        </div>

        <h1 class="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Welcome to OpenCode Client</h1>

        <p class="mb-8 text-base text-gray-600 dark:text-gray-400">Select a folder to start coding with AI</p>

        <button
          onClick={props.onSelectFolder}
          disabled={props.isLoading}
          class="mb-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {props.isLoading ? (
            <>
              <Loader2 class="h-4 w-4 animate-spin" />
              Selecting...
            </>
          ) : (
            "Select Folder"
          )}
        </button>

        <p class="text-sm text-gray-500 dark:text-gray-500">
          Keyboard shortcut: {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+N
        </p>

        <div class="mt-6 space-y-1 text-sm text-gray-400 dark:text-gray-600">
          <p>Examples: ~/projects/my-app</p>
          <p>You can have multiple instances of the same folder</p>
        </div>
      </div>
    </div>
  )
}

export default EmptyState
