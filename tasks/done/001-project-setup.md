# Task 001: Project Setup & Boilerplate

## Goal

Set up the basic Electron + SolidJS + Vite project structure with all necessary dependencies and configuration files.

## Prerequisites

- Node.js 18+ installed
- Bun package manager
- OpenCode CLI installed and accessible in PATH

## Acceptance Criteria

- [ ] Project structure matches documented layout
- [ ] All dependencies installed
- [ ] Dev server starts successfully
- [ ] Electron window launches
- [ ] Hot reload works for renderer
- [ ] TypeScript compilation works
- [ ] Basic "Hello World" renders

## Steps

### 1. Initialize Package

- Create `package.json` with project metadata
- Set `name`: `@opencode-ai/client`
- Set `version`: `0.1.0`
- Set `type`: `module`
- Set `main`: `dist/main/main.js`

### 2. Install Core Dependencies

**Production:**

- `electron` ^28.0.0
- `solid-js` ^1.8.0
- `@solidjs/router` ^0.13.0
- `@opencode-ai/sdk` (from workspace)

**Development:**

- `electron-vite` ^2.0.0
- `electron-builder` ^24.0.0
- `vite` ^5.0.0
- `vite-plugin-solid` ^2.10.0
- `typescript` ^5.3.0
- `tailwindcss` ^4.0.0
- `@tailwindcss/vite` ^4.0.0

**UI Libraries:**

- `@kobalte/core` ^0.13.0
- `shiki` ^1.0.0
- `marked` ^12.0.0
- `lucide-solid` ^0.300.0

### 3. Create Directory Structure

```
packages/opencode-client/
├── electron/
│   ├── main/
│   │   └── main.ts
│   ├── preload/
│   │   └── index.ts
│   └── resources/
│       └── icon.png
├── src/
│   ├── components/
│   ├── stores/
│   ├── lib/
│   ├── hooks/
│   ├── types/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── docs/
├── tasks/
│   ├── todo/
│   └── done/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── electron.vite.config.ts
├── tailwind.config.js
├── .gitignore
└── README.md
```

### 4. Configure TypeScript

**tsconfig.json** (for renderer):

- `target`: ES2020
- `module`: ESNext
- `jsx`: preserve
- `jsxImportSource`: solid-js
- `moduleResolution`: bundler
- `strict`: true
- Path alias: `@/*` → `./src/*`

**tsconfig.node.json** (for main & preload):

- `target`: ES2020
- `module`: ESNext
- `moduleResolution`: bundler
- Include: `electron/**/*.ts`

### 5. Configure Electron Vite

**electron.vite.config.ts:**

- Main process config: External electron
- Preload config: External electron
- Renderer config:
  - SolidJS plugin
  - TailwindCSS plugin
  - Path alias resolution
  - Dev server port: 3000

### 6. Configure TailwindCSS

**tailwind.config.js:**

- Content: `['./src/**/*.{ts,tsx}']`
- Theme: Default (will customize later)
- Plugins: None initially

**src/index.css:**

```css
@import "tailwindcss";
```

### 7. Create Main Process Entry

**electron/main/main.ts:**

- Import app, BrowserWindow from electron
- Set up window creation
- Window size: 1400x900
- Min size: 800x600
- Web preferences:
  - preload: path to preload script
  - contextIsolation: true
  - nodeIntegration: false
- Load URL based on environment:
  - Dev: http://localhost:3000
  - Prod: Load dist/index.html
- Handle app lifecycle:
  - ready event
  - window-all-closed (quit on non-macOS)
  - activate (recreate window on macOS)

### 8. Create Preload Script

**electron/preload/index.ts:**

- Import contextBridge, ipcRenderer
- Expose electronAPI object:
  - Placeholder methods for future IPC
- Type definitions for window.electronAPI

### 9. Create Renderer Entry

**src/main.tsx:**

- Import render from solid-js/web
- Import App component
- Render to #root element

**src/App.tsx:**

- Basic component with "Hello OpenCode Client"
- Display environment info
- Basic styling with TailwindCSS

**index.html:**

- Root div with id="root"
- Link to src/main.tsx

### 10. Add Scripts to package.json

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json",
    "preview": "electron-vite preview",
    "package:mac": "electron-builder --mac",
    "package:win": "electron-builder --win",
    "package:linux": "electron-builder --linux"
  }
}
```

### 11. Configure Electron Builder

**electron-builder.yml** or in package.json:

- appId: ai.opencode.client
- Product name: OpenCode Client
- Build resources: electron/resources
- Files to include: dist/, package.json
- Directories:
  - output: release
  - buildResources: electron/resources
- Platform-specific configs (basic)

### 12. Add .gitignore

```
node_modules/
dist/
release/
.DS_Store
*.log
.vite/
.electron-vite/
```

### 13. Create README

- Project description
- Prerequisites
- Installation instructions
- Development commands
- Build commands
- Architecture overview link

## Verification Steps

1. Run `bun install`
2. Run `bun run dev`
3. Verify Electron window opens
4. Verify "Hello OpenCode Client" displays
5. Make a change to App.tsx
6. Verify hot reload updates UI
7. Run `bun run typecheck`
8. Verify no TypeScript errors
9. Run `bun run build`
10. Verify dist/ folder created

## Dependencies for Next Tasks

- Task 002 (Empty State) depends on this
- Task 003 (Process Manager) depends on this

## Estimated Time

2-3 hours

## Notes

- Keep this minimal - just the skeleton
- Don't add any business logic yet
- Focus on getting build pipeline working
- Use official Electron + Vite + Solid templates as reference
