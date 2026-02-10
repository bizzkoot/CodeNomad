# CodeNomad

A fast, multi-instance workspace for running OpenCode sessions. This is a fork of shantur/CodeNomad with enhancements.

## Project Structure

```
CodeNomad/
├── .claude/
│   └── structure/       # Detailed structure index (per-directory YAML)
├── packages/
│   ├── cloudflare/      # Cloudflare deployment config
│   ├── electron-app/    # Native desktop application (Electron)
│   ├── mcp-server/      # MCP server implementation
│   ├── opencode-config/ # OpenCode plugin integration
│   ├── server/          # Core server logic and API
│   ├── tauri-app/       # Native desktop application (Tauri)
│   └── ui/              # SolidJS frontend
└── temp/                # Temporary/legacy code
```

## Codebase Structure Index

The file map below provides instant orientation. For detailed export signatures and dependencies, read the relevant `.claude/structure/*.yaml` file for the directory you're working in.

After adding, removing, or renaming source files or public classes/functions, update both the file map below and the relevant structure YAML file.

### File Map

#### Cloudflare
`packages/cloudflare/src/index.ts` - Cloudflare deployment entry point

#### Electron App
`packages/electron-app/electron/main/main.ts` - Electron application main process
`packages/electron-app/electron/main/menu.ts` - Electron application menu setup
`packages/electron-app/electron/main/process-manager.ts` - Electron process management
`packages/electron-app/electron/main/ipc.ts` - Electron IPC communication
`packages/electron-app/electron/main/storage.ts` - Electron local storage
`packages/electron-app/electron/main/user-shell.ts` - Electron shell integration

#### MCP Server
`packages/mcp-server/src/index.ts` - MCP server entry point
`packages/mcp-server/src/server.ts` - MCP server implementation
`packages/mcp-server/src/bridge/renderer.ts` - MCP bridge for renderer
`packages/mcp-server/src/bridge/ipc.ts` - IPC bridge implementation
`packages/mcp-server/src/bridge/types.ts` - MCP bridge type definitions
`packages/mcp-server/src/config/registration.ts` - MCP tool registration
`packages/mcp-server/src/tools/askUser.ts` - User interaction tool
`packages/mcp-server/src/tools/schemas.ts` - MCP tool schemas
`packages/mcp-server/src/pending.ts` - Pending request handling

#### OpenCode Config
`packages/opencode-config/plugin/codenomad.ts` - OpenCode plugin main file
`packages/opencode-config/plugin/lib/client.ts` - OpenCode client library
`packages/opencode-config/plugin/lib/request.ts` - OpenCode request handling
`packages/opencode-config/plugin/lib/background-process.ts` - OpenCode background processes

#### Server
`packages/server/src/bin.ts` - Server binary entry point
`packages/server/src/loader.ts` - Server module loader
`packages/server/src/launcher.ts` - Server launch manager
`packages/server/src/logger.ts` - Application logging system

`packages/server/src/config/store.ts` - Configuration persistence
`packages/server/src/config/binaries.ts` - Binary registry management
`packages/server/src/config/schema.ts` - Configuration schemas

`packages/server/src/auth/auth-store.ts` - Authentication state management
`packages/server/src/auth/session-manager.ts` - Session handling
`packages/server/src/auth/token-manager.ts` - Token management
`packages/server/src/auth/password-hash.ts` - Password hashing utilities
`packages/server/src/auth/http-auth.ts` - HTTP authentication middleware

`packages/server/src/filesystem/search.ts` - Filesystem search functionality
`packages/server/src/filesystem/search-cache.ts` - Search cache implementation

`packages/server/src/storage/instance-store.ts` - Instance data storage
`packages/server/src/events/bus.ts` - Event bus implementation
`packages/server/src/background-processes/manager.ts` - Background process manager

`packages/server/src/plugins/channel.ts` - Plugin communication channel
`packages/server/src/plugins/handlers.ts` - Plugin event handlers
`packages/server/src/opencode-config.ts` - OpenCode configuration

`packages/server/src/workspaces/manager.ts` - Workspace management
`packages/server/src/workspaces/runtime.ts` - Workspace runtime
`packages/server/src/workspaces/opencode-auth.ts` - OpenCode workspace auth

`packages/server/src/server/routes/auth.ts` - Authentication API routes (POST /auth/login)
`packages/server/src/server/routes/config.ts` - Configuration API routes (GET/PUT /api/config)
`packages/server/src/server/routes/events.ts` - Event streaming API (GET /api/events)
`packages/server/src/server/routes/storage.ts` - Instance data API (GET/PUT /api/storage)
`packages/server/src/server/routes/workspaces.ts` - Workspace API routes (GET/POST /api/workspaces)
`packages/server/src/server/routes/filesystem.ts` - Filesystem API routes (GET/POST /api/filesystem)
`packages/server/src/server/routes/plugin.ts` - Plugin API routes (POST /api/plugin)
`packages/server/src/server/routes/background-processes.ts` - Process API (GET/POST /api/processes)
`packages/server/src/server/routes/meta.ts` - Metadata API (GET /api/meta)
`packages/server/src/server/routes/git.ts` - Git operations API

#### Tauri App
`packages/tauri-app/src-tauri/src/main.rs` - Tauri Rust main application
`packages/tauri-app/src-tauri/src/cli_manager.rs` - CLI management in Rust

#### UI (SolidJS Frontend)
`packages/ui/src/renderer/main.tsx` - SolidJS application entry point

**Types**
`packages/ui/src/types/attachment.ts` - Attachment type definitions
`packages/ui/src/types/instance.ts` - Instance type definitions
`packages/ui/src/types/permission.ts` - Permission type definitions
`packages/ui/src/types/message.ts` - Message type definitions
`packages/ui/src/types/question.ts` - Question type definitions
`packages/ui/src/types/search.ts` - Search type definitions
`packages/ui/src/types/session.ts` - Session type definitions

**Libraries**
`packages/ui/src/lib/ansi.ts` - ANSI color parsing utilities
`packages/ui/src/lib/clipboard.ts` - Clipboard interaction utilities
`packages/ui/src/lib/api-client.ts` - API client for server communication
`packages/ui/src/lib/command-utils.ts` - Command utilities
`packages/ui/src/lib/commands.ts` - Command registry
`packages/ui/src/lib/diff-utils.ts` - Diff utilities
`packages/ui/src/lib/file-path-validator.ts` - File path validation
`packages/ui/src/lib/formatters.ts` - Text formatting utilities
`packages/ui/src/lib/global-cache.ts` - Global data caching
`packages/ui/src/lib/i18n/index.tsx` - i18n provider and utilities
`packages/ui/src/lib/keyboard.ts` - Keyboard shortcuts system
`packages/ui/src/lib/markdown.ts` - Markdown rendering
`packages/ui/src/lib/markdown-file-detector.ts` - Markdown file detection
`packages/ui/src/lib/mcp-bridge.ts` - MCP bridge integration
`packages/ui/src/lib/native/cli.ts` - CLI native API
`packages/ui/src/lib/native/electron/functions.ts` - Electron native functions
`packages/ui/src/lib/native/tauri/functions.ts` - Tauri native functions
`packages/ui/src/lib/native/native-functions.ts` - Generic native functions
`packages/ui/src/lib/notifications.tsx` - Notification system
`packages/ui/src/lib/opencode-api.ts` - OpenCode API client
`packages/ui/src/lib/prompt-placeholders.ts` - Prompt template placeholders
`packages/ui/src/lib/runtime-env.ts` - Runtime environment detection
`packages/ui/src/lib/sdk-manager.ts` - SDK management
`packages/ui/src/lib/search-algorithm.ts` - Search algorithm
`packages/ui/src/lib/search-highlight.ts` - Search highlighting
`packages/ui/src/lib/server-events.ts` - Server event handling
`packages/ui/src/lib/server-meta.ts` - Server metadata client
`packages/ui/src/lib/session-sidebar-events.ts` - Sidebar event handling
`packages/ui/src/lib/sse-manager.ts` - SSE connection management
`packages/ui/src/lib/storage.ts` - Client-side storage
`packages/ui/src/lib/theme.tsx` - Theme management

**Stores**
`packages/ui/src/stores/attachments.ts` - Attachment management store
`packages/ui/src/stores/alerts.ts` - Alert notification store
`packages/ui/src/stores/background-processes.ts` - Background process store
`packages/ui/src/stores/command-palette.ts` - Command palette store
`packages/ui/src/stores/commands.ts` - Command registry store
`packages/ui/src/stores/failed-notifications.ts` - Failed notification store
`packages/ui/src/stores/git.ts` - Git state store
`packages/ui/src/stores/github-stars.ts` - GitHub stars tracking
`packages/ui/src/stores/instance-config.tsx` - Instance configuration store
`packages/ui/src/stores/instance-metadata.ts` - Instance metadata store
`packages/ui/src/stores/instances.ts` - Instance management store
`packages/ui/src/stores/message-history.ts` - Message history management
`packages/ui/src/stores/session-compaction.ts` - Session optimization
`packages/ui/src/stores/session-models.ts` - Session model selection
`packages/ui/src/stores/session-status.ts` - Session status tracking
`packages/ui/src/stores/tool-call-state.ts` - Tool call state management
`packages/ui/src/stores/preferences.tsx` - User preferences store
`packages/ui/src/stores/questions.ts` - Question handling store
`packages/ui/src/stores/releases.ts` - Release tracking store
`packages/ui/src/stores/search-store.ts` - Search state store
`packages/ui/src/stores/session-actions.ts` - Session action handlers
`packages/ui/src/stores/session-api.ts` - Session API client
`packages/ui/src/stores/session-events.ts` - Session event handling
`packages/ui/src/stores/sessions.ts` - Session management store
`packages/ui/src/stores/ui.ts` - UI state store

**Message v2 Store**
`packages/ui/src/stores/message-v2/bus.ts` - Message bus v2
`packages/ui/src/stores/message-v2/bridge.ts` - Message bridge
`packages/ui/src/stores/message-v2/instance-store.ts` - Instance message store v2
`packages/ui/src/stores/message-v2/normalizers.ts` - Message normalization
`packages/ui/src/stores/message-v2/record-display-cache.ts` - Message display cache
`packages/ui/src/stores/message-v2/session-info.ts` - Session info v2
`packages/ui/src/stores/message-v2/types.ts` - Message v2 types

**Hooks**
`packages/ui/src/lib/hooks/use-app-lifecycle.ts` - App lifecycle hook
`packages/ui/src/lib/hooks/use-commands.ts` - Commands hook
`packages/ui/src/lib/hooks/use-global-cache.ts` - Global cache hook
`packages/ui/src/lib/hooks/use-instance-metadata.ts` - Instance metadata hook
`packages/ui/src/lib/hooks/use-markdown-preview.ts` - Markdown preview hook
`packages/ui/src/lib/hooks/use-scroll-cache.ts` - Scroll position caching

**Contexts**
`packages/ui/src/lib/contexts/instance-metadata-context.tsx` - Instance metadata context

**Shortcuts**
`packages/ui/src/lib/shortcuts/agent.ts` - Agent shortcuts
`packages/ui/src/lib/shortcuts/escape.ts` - Escape key shortcuts
`packages/ui/src/lib/shortcuts/input.ts` - Input field shortcuts
`packages/ui/src/lib/shortcuts/navigation.ts` - Navigation shortcuts
`packages/ui/src/lib/shortcuts/search.ts` - Search shortcuts

**Components**
`packages/ui/src/components/agent-selector.tsx` - AI model selection
`packages/ui/src/components/alert-dialog.tsx` - Alert modal dialog
`packages/ui/src/components/askquestion-wizard.tsx` - Question wizard component
`packages/ui/src/components/attachment-chip.tsx` - File attachment chips
`packages/ui/src/components/background-process-output-dialog.tsx` - Process output display
`packages/ui/src/components/brand-icons.tsx` - Application icons
`packages/ui/src/components/code-block-inline.tsx` - Inline code display
`packages/ui/src/components/command-palette.tsx` - Searchable command palette
`packages/ui/src/components/directory-browser-dialog.tsx` - Directory selection dialog
`packages/ui/src/components/diff-viewer.tsx` - Code diff display
`packages/ui/src/components/empty-state.tsx` - Empty state illustrations
`packages/ui/src/components/environment-variables-editor.tsx` - Env variable editor
`packages/ui/src/components/expand-button.tsx` - Expand/collapse button
`packages/ui/src/components/filesystem-browser-dialog.tsx` - File system browser
`packages/ui/src/components/folder-selection-view.tsx` - Folder selection interface
`packages/ui/src/components/folder-tree-browser.tsx` - Folder tree navigation
`packages/ui/src/components/folder-tree-node.tsx` - Tree node component
`packages/ui/src/components/failed-notification-banner.tsx` - Error notifications
`packages/ui/src/components/failed-notification-panel.tsx` - Error panel display
`packages/ui/src/components/hint-row.tsx` - Keyboard hints
`packages/ui/src/components/info-view.tsx` - Information display
`packages/ui/src/components/instance-disconnected-modal.tsx` - Disconnect alert
`packages/ui/src/components/instance-info.tsx` - Instance details panel
`packages/ui/src/components/instance-service-status.tsx` - Service status indicator
`packages/ui/src/components/instance-tab.tsx` - Individual instance tab
`packages/ui/src/components/instance-tabs.tsx` - Instance tab navigation
`packages/ui/src/components/instance-welcome-view.tsx` - Welcome screen
`packages/ui/src/components/kbd.tsx` - Keyboard shortcut display
`packages/ui/src/components/keyboard-hint.tsx` - Shortcut hints
`packages/ui/src/components/lazy-diff-viewer.tsx` - Lazy-loaded diff viewer
`packages/ui/src/components/logs-view.tsx` - Log output display
`packages/ui/src/components/markdown.tsx` - Markdown rendering
`packages/ui/src/components/markdown-preview-icon.tsx` - Markdown preview button
`packages/ui/src/components/markdown-preview-modal.tsx` - Markdown preview
`packages/ui/src/components/message-block-list.tsx` - Message listing
`packages/ui/src/components/message-block.tsx` - Individual message blocks
`packages/ui/src/components/message-item.tsx` - Single message component
`packages/ui/src/components/message-list-header.tsx` - Message list header
`packages/ui/src/components/message-part.tsx` - Message part renderer
`packages/ui/src/components/message-preview.tsx` - Message preview
`packages/ui/src/components/message-section.tsx` - Message sections
`packages/ui/src/components/message-timeline.tsx` - Message timeline
`packages/ui/src/components/model-selector.tsx` - Model selection dropdown
`packages/ui/src/components/opencode-binary-selector.tsx` - Binary selection
`packages/ui/src/components/permission-approval-modal.tsx` - Permission approval
`packages/ui/src/components/permission-notification-banner.tsx` - Permission notifications
`packages/ui/src/components/prompt-input.tsx` - Chat input field
`packages/ui/src/components/question-notification-banner.tsx` - Question notifications
`packages/ui/src/components/remote-access-overlay.tsx` - Remote access indicator
`packages/ui/src/components/search-highlighted-text.tsx` - Search highlighting
`packages/ui/src/components/search-panel.tsx` - Search interface
`packages/ui/src/components/session-list.tsx` - Session listing
`packages/ui/src/components/session-picker.tsx` - Session selection
`packages/ui/src/components/session-rename-dialog.tsx` - Session rename
`packages/ui/src/components/theme-mode-toggle.tsx` - Dark/light mode toggle
`packages/ui/src/components/thinking-selector.tsx` - Thinking mode selection
`packages/ui/src/components/tool-call/*.tsx` - Tool call renderers and utilities
`packages/ui/src/components/tool-call.tsx` - Tool call display
`packages/ui/src/components/unified-picker.tsx` - Unified selection dialog
`packages/ui/src/components/version-pill.tsx` - Version display pill
`packages/ui/src/components/virtual-item.tsx` - Virtual list items

**Source Control Components**
`packages/ui/src/components/source-control/source-control-panel.tsx` - Git status and actions

**Session Components**
`packages/ui/src/components/session/context-usage-panel.tsx` - Context usage display
`packages/ui/src/components/session/session-view.tsx` - Main session view

**Instance Components**
`packages/ui/src/components/instance/instance-shell2.tsx` - Instance shell wrapper

**Advanced Settings**
`packages/ui/src/components/advanced-settings-modal.tsx` - Advanced settings dialog

**i18n**
`packages/ui/src/lib/i18n/messages/` - Translation files (en, es, fr, ja, ru, zh-Hans)

## Development Notes

### Build Commands
- `npm run build --workspace @neuralnomads/codenomad` - Build server
- `npm run build --workspace @neuralnomads/codenomad-ui` - Build UI
- `npm run build --workspace @neuralnomads/codenomad-electron-app` - Build Electron app

### Technology Stack
- **Server**: Node.js/TypeScript, Fastify
- **UI**: SolidJS, Vite
- **Desktop**: Electron, Tauri (Rust)
- **MCP**: Custom MCP server implementation
