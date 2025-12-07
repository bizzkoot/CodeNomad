export interface KeyboardShortcut {
  key: string
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export interface Command {
  id: string
  label: string | (() => string)
  description: string
  keywords?: string[]
  shortcut?: KeyboardShortcut
  action: () => void | Promise<void>
  category?: string
}

export function createCommandRegistry() {
  const commands = new Map<string, Command>()

  function register(command: Command) {
    commands.set(command.id, command)
  }

  function unregister(id: string) {
    commands.delete(id)
  }

  function get(id: string) {
    return commands.get(id)
  }

  function getAll() {
    return Array.from(commands.values())
  }

  function execute(id: string) {
    const command = commands.get(id)
    if (command) {
      return command.action()
    }
  }

  function search(query: string) {
    if (!query) return getAll()

    const lowerQuery = query.toLowerCase()
    return getAll().filter((cmd) => {
      const label = typeof cmd.label === "function" ? cmd.label() : cmd.label
      const labelMatch = label.toLowerCase().includes(lowerQuery)
      const descMatch = cmd.description.toLowerCase().includes(lowerQuery)
      const keywordMatch = cmd.keywords?.some((k) => k.toLowerCase().includes(lowerQuery))
      return labelMatch || descMatch || keywordMatch
    })
  }

  return {
    register,
    unregister,
    get,
    getAll,
    execute,
    search,
  }
}

export type CommandRegistry = ReturnType<typeof createCommandRegistry>
