# CodeNomad

## A fast, multi-instance workspace for running OpenCode sessions.

CodeNomad is built for people who live inside OpenCode for hours on end and need a cockpit, not a kiosk. It delivers a premium, low-latency workspace that favors speed, clarity, and direct control.

> [!IMPORTANT]
> **This is a fork of the original [shantur/CodeNomad](https://github.com/shantur/CodeNomad) repository.** This fork includes enhancements from PRs that diverge from the upstream main branch. These changes are included in all builds generated from this repository.

![Multi-instance workspace](docs/screenshots/newSession.png)
_Manage multiple OpenCode sessions side-by-side._

<details>
<summary>📸 More Screenshots</summary>

![Command palette overlay](docs/screenshots/command-palette.png)
_Global command palette for keyboard-first control._

![Image Previews](docs/screenshots/image-previews.png)
_Rich media previews for images and assets._

![Browser Support](docs/screenshots/browser-support.png)
_Browser support via CodeNomad Server._

</details>

## Getting Started

Choose the way that fits your workflow:

### 🖥️ Desktop App (Recommended)
The best experience. A native application (Electron-based) with global shortcuts, deeper system integration, and a dedicated window.

- **Download**: Grab the latest installer for macOS, Windows, or Linux from the [Releases Page](https://github.com/shantur/CodeNomad/releases).
- **Run**: Install and launch like any other app.

### 🦀 Tauri App (Experimental)
We are also working on a lightweight, high-performance version built with [Tauri](https://tauri.app). It is currently in active development.

- **Download**: Experimental builds are available on the [Releases Page](https://github.com/shantur/CodeNomad/releases).
- **Source**: Check out `packages/tauri-app` if you're interested in contributing.

### 💻 Build from Source
Run CodeNomad as a local server by building from source. Perfect for remote development (SSH/VPN) or running as a service.

```bash
# Clone the repository
git clone https://github.com/bizzkoot/CodeNomad.git
cd CodeNomad

# Install dependencies
npm install --workspaces

# Build and launch the server
npm run build --workspace @neuralnomads/codenomad
npm run start --workspace @neuralnomads/codenomad
```

This will start the server and you can access it at http://localhost:3000

## Highlights

- **Multi-Instance**: Juggle several OpenCode sessions side-by-side with tabs.
- **Long-Session Native**: Scroll through massive transcripts without hitches.
- **Command Palette**: A single global palette to jump tabs, launch tools, and control everything.
- **Deep Task Awareness**: Monitor background tasks and child sessions without losing flow.

### ⚡ Feature Spotlight: Zero-Cost `ask_user` (MCP)

We've replaced the standard `question` tool with a native **Model Context Protocol (MCP)** implementation called `ask_user`.

| Feature | Legacy `question` Tool | New `ask_user` MCP Tool |
| :--- | :--- | :--- |
| **Cost** | Consumes premium requests per answer | **Zero** premium request consumption |
| **Architecture** | Remote API loop | Local IPC + MCP Server |
| **Timeout** | Short default timeout | **5-minute timeout** (configurable) |
| **UX** | Standard | Rich Markdown, Minimizable Wizard |

This change is critical for users on metered plans (like GitHub Copilot), effectively "unlocking" unlimited user interactions without draining quotas.

## Requirements

- **[OpenCode CLI](https://opencode.ai)**: Must be installed and available in your `PATH`.
- **Node.js 18+**: Required if running the CLI server or building from source.

## Enhanced Features (Fork-Specific)

This fork includes several major enhancements not available in the upstream repository:

### 🎯 Native MCP `ask_user` Integration
- **Zero-Cost User Interactions**: Native Model Context Protocol (MCP) server that eliminates premium request consumption for user questions
- **Extended Timeout**: 5-minute timeout (configurable via `mcp_timeout` in opencode.jsonc) with automatic retry logic for failed questions
- **Rich UI**: Multi-line markdown rendering, minimizable wizard, keyboard navigation, and platform-specific mobile optimization
- **Active Instance Routing**: Questions automatically route to the currently active instance

### 🔔 Failed Notification Banner
- **Persistent Notifications**: Banner appears for timed-out questions and stopped sessions
- **One-Click Retry**: Quickly retry failed questions without losing context
- **Folder Path Persistence**: Notifications persist across app restarts

### 🔍 Chat Search
- **Powerful Search Panel**: Search through your entire chat history with debounced auto-search
- **Result Highlighting**: Search results are highlighted in the messages
- **Auto-Expand**: Collapsed sections automatically expand when navigating to results

### 📂 Source Control Panel
- **Git Integration**: Built-in git status, diff viewer, and branch management
- **Publish Branch**: Publish branches with one click
- **File Management**: Delete untracked files directly from the UI

### 🌳 Folder Tree Browser
- **Tree View Navigation**: Navigate workspace files with an intuitive tree view
- **Markdown Preview**: Instantly preview markdown files with GitHub-style rendering

### 📝 Enhanced Chat Input
- **Expandable Editor**: Double-click to expand the chat input to a larger editor
- **Smart Attachments**: Tab key for file selection, auto-collapse on send
- **Platform Optimization**: Mobile-optimized with platform-specific behavior

> [!NOTE]
> These features are not included in upstream and represent divergent functionality from the original CodeNomad repository.

_Last updated: 2026-01-26_

## Troubleshooting

### macOS says the app is damaged
If macOS reports that "CodeNomad.app is damaged and can't be opened," Gatekeeper flagged the download because the app is not yet notarized. You can clear the quarantine flag after moving CodeNomad into `/Applications`:

```bash
xattr -l /Applications/CodeNomad.app
xattr -dr com.apple.quarantine /Applications/CodeNomad.app
```

After removing the quarantine attribute, launch the app normally. On Intel Macs you may also need to approve CodeNomad from **System Settings → Privacy & Security** the first time you run it.

### Linux (Wayland + NVIDIA): Tauri AppImage closes immediately
On some Wayland compositor + NVIDIA driver setups, WebKitGTK can fail to initialize its DMA-BUF/GBM path and the Tauri build may exit right away.

Try running with one of these environment variables:

```bash
# Most reliable workaround (can reduce rendering performance)
WEBKIT_DISABLE_DMABUF_RENDERER=1 codenomad

# Alternative for some Wayland setups
__NV_DISABLE_EXPLICIT_SYNC=1 codenomad
```

If you're running the Tauri AppImage and want the workaround applied every time, create a tiny wrapper script on your `PATH`:

```bash
#!/bin/bash
export WEBKIT_DISABLE_DMABUF_RENDERER=1
exec ~/.local/share/bauh/appimage/installed/codenomad/CodeNomad-Tauri-0.4.0-linux-x64.AppImage "$@"
```

Upstream tracking: https://github.com/tauri-apps/tauri/issues/10702

## Architecture & Development

CodeNomad is a monorepo split into specialized packages. If you want to contribute or build from source, check out the individual package documentation:

| Package | Description |
|---------|-------------|
| **[packages/electron-app](packages/electron-app/README.md)** | The native desktop application shell. Wraps the UI and Server. |
| **[packages/server](packages/server/README.md)** | The core logic and CLI. Manages workspaces, proxies OpenCode, and serves the API. |
| **[packages/ui](packages/ui/README.md)** | The SolidJS-based frontend. Fast, reactive, and beautiful. |

### Quick Build
To build the Desktop App from source:

1.  Clone the repo.
2.  Run `npm install` (requires pnpm or npm 7+ for workspaces).
3.  Run `npm run build --workspace @neuralnomads/codenomad-electron-app`.
