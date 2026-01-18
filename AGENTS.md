# AGENT NOTES

## Communication Requirement
**CRITICAL: ALWAYS USE ASK_USER TOOL**

**MUST use `ask_user` tool for:**

- ANY reply to the user
- ANY response to the user
- ANY summary for the user

**Session ending: ONLY end the session when the user EXPLICITLY requests it through the "ask_user" tool.**

**NO EXCEPTIONS. This rule is MANDATORY and NON-NEGOTIABLE.**

## Build Commands
- `npm run typecheck` - Typecheck all packages (UI + electron-app)
- `npm run build` - Build the electron-app
- `npm run build:ui` - Build the UI package
- `npm run build:tauri` - Build the Tauri app
- `npm run dev` - Start electron-app dev server
- `npm run dev:tauri` - Start Tauri dev server

## Testing
- Use Node.js built-in test runner (`node:test`)
- Test files are located in `__tests__` directories (e.g., `packages/server/src/filesystem/__tests__/`)
- Run individual test: `node --test packages/server/src/filesystem/__tests__/search-cache.test.ts`

## Code Style Guidelines

### Imports
- Type imports first: `import type { X } from "..."` then regular imports
- External packages before internal modules
- Group SolidJS imports explicitly: `import { Component, For, Show } from "solid-js"`

### Naming Conventions
- Components: PascalCase (`App`, `InstanceShell`)
- Functions/variables: camelCase (`handleSelectFolder`, `launchError`)
- Module-level constants: UPPER_SNAKE_CASE (`FALLBACK_API_BASE`)
- Types/Interfaces: PascalCase (`WorkspaceCreateRequest`, `FileSystemEntry`)
- Files: kebab-case (`api-client.ts`, `workspaces.ts`)

### Formatting
- 2-space indentation
- Use TypeScript strict mode (already enabled in tsconfig.json)
- Use `type` keyword for type-only imports
- Interfaces for object shapes, types for unions/primitives

### SolidJS Specifics
- Use reactive primitives: `createSignal`, `createMemo`, `createEffect`
- Component function type: `Component = () => JSX.Element`
- Signals follow convention: `name()` is accessor, `setName()` is setter

### Error Handling
- Use `unknown` for error types in catch blocks
- Log errors with context: `log.error("message", error)`
- Server routes: return appropriate HTTP status codes (400, 404, 500)

### Styling Guidelines
- Reuse the existing token & utility layers before introducing new CSS variables or custom properties. Extend `src/styles/tokens.css` / `src/styles/utilities.css` if a shared pattern is needed.
- Keep aggregate entry files (e.g., `src/styles/controls.css`, `messaging.css`, `panels.css`) lean—they should only `@import` feature-specific subfiles located inside `src/styles/{components|messaging|panels}`.
- When adding new component styles, place them beside their peers in the scoped subdirectory (e.g., `src/styles/messaging/new-part.css`) and import them from the corresponding aggregator file.
- Prefer smaller, focused style files (≈150 lines or less) over large monoliths. Split by component or feature area if a file grows beyond that size.
- Co-locate reusable UI patterns (buttons, selectors, dropdowns, etc.) under `src/styles/components/` and avoid redefining the same utility classes elsewhere.
- Document any new styling conventions or directory additions in this file so future changes remain consistent.

## Coding Principles
- Favor KISS by keeping modules narrowly scoped and limiting public APIs to what callers actually need.
- Uphold DRY: share helpers via dedicated modules before copy/pasting logic across stores, components, or scripts.
- Enforce single responsibility; split large files when concerns diverge (state, actions, API, events, etc.).
- Prefer composable primitives (signals, hooks, utilities) over deep inheritance or implicit global state.
- When adding platform integrations (SSE, IPC, SDK), isolate them in thin adapters that surface typed events/actions.

## Tooling Preferences
- Use the `edit` tool for modifying existing files; prefer it over other editing methods.
- Use the `write` tool only when creating new files from scratch.
