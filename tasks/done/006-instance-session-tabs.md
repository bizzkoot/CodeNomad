# Task 006: Instance & Session Tabs

## Goal

Create the two-level tab navigation system: instance tabs (Level 1) and session tabs (Level 2) that allow users to switch between projects and conversations.

## Prerequisites

- Task 005 completed (Session picker modal, active session selection)
- Understanding of tab navigation patterns
- Familiarity with SolidJS For/Show components
- Knowledge of keyboard accessibility

## Acceptance Criteria

- [ ] Instance tabs render at top level
- [ ] Session tabs render below instance tabs for active instance
- [ ] Can switch between instance tabs
- [ ] Can switch between session tabs within an instance
- [ ] Active tab is visually highlighted
- [ ] Tab labels show appropriate text (folder name, session title)
- [ ] Close buttons work on tabs (with confirmation)
- [ ] "+" button creates new instance/session
- [ ] Keyboard navigation works (Cmd/Ctrl+1-9 for tabs)
- [ ] Tabs scroll horizontally when many exist
- [ ] Properly styled and accessible

## Steps

### 1. Create Instance Tabs Component

**src/components/instance-tabs.tsx:**

**Props:**

```typescript
interface InstanceTabsProps {
  instances: Map<string, Instance>
  activeInstanceId: string | null
  onSelect: (instanceId: string) => void
  onClose: (instanceId: string) => void
  onNew: () => void
}
```

**Structure:**

```tsx
<div class="instance-tabs">
  <div class="tabs-container">
    <For each={Array.from(instances.entries())}>
      {([id, instance]) => (
        <InstanceTab
          instance={instance}
          active={id === activeInstanceId}
          onSelect={() => onSelect(id)}
          onClose={() => onClose(id)}
        />
      )}
    </For>
    <button class="new-tab-button" onClick={onNew}>
      +
    </button>
  </div>
</div>
```

**Styling:**

- Horizontal layout
- Background: Secondary background color
- Border bottom: 1px solid border color
- Height: 40px
- Padding: 0 8px
- Overflow-x: auto (for many tabs)

### 2. Create Instance Tab Item Component

**src/components/instance-tab.tsx:**

**Props:**

```typescript
interface InstanceTabProps {
  instance: Instance
  active: boolean
  onSelect: () => void
  onClose: () => void
}
```

**Structure:**

```tsx
<button class={`instance-tab ${active ? "active" : ""}`} onClick={onSelect}>
  <span class="tab-icon">📁</span>
  <span class="tab-label">{formatFolderName(instance.folder)}</span>
  <button
    class="tab-close"
    onClick={(e) => {
      e.stopPropagation()
      onClose()
    }}
  >
    ×
  </button>
</button>
```

**Styling:**

- Display: inline-flex
- Align items center
- Gap: 8px
- Padding: 8px 12px
- Border radius: 6px 6px 0 0
- Max width: 200px
- Truncate text with ellipsis
- Active: Background accent color
- Inactive: Transparent background
- Hover: Light background

**Folder Name Formatting:**

```typescript
function formatFolderName(path: string): string {
  const name = path.split("/").pop() || path
  return `~/${name}`
}
```

**Handle Duplicates:**

- If multiple instances have same folder name, add counter
- Example: `~/project`, `~/project (2)`, `~/project (3)`

### 3. Create Session Tabs Component

**src/components/session-tabs.tsx:**

**Props:**

```typescript
interface SessionTabsProps {
  instanceId: string
  sessions: Map<string, Session>
  activeSessionId: string | null
  onSelect: (sessionId: string) => void
  onClose: (sessionId: string) => void
  onNew: () => void
}
```

**Structure:**

```tsx
<div class="session-tabs">
  <div class="tabs-container">
    <For each={Array.from(sessions.entries())}>
      {([id, session]) => (
        <SessionTab
          session={session}
          active={id === activeSessionId}
          onSelect={() => onSelect(id)}
          onClose={() => onClose(id)}
        />
      )}
    </For>
    <SessionTab special="logs" active={activeSessionId === "logs"} onSelect={() => onSelect("logs")} />
    <button class="new-tab-button" onClick={onNew}>
      +
    </button>
  </div>
</div>
```

**Styling:**

- Similar to instance tabs but smaller
- Height: 36px
- Font size: 13px
- Less prominent than instance tabs

### 4. Create Session Tab Item Component

**src/components/session-tab.tsx:**

**Props:**

```typescript
interface SessionTabProps {
  session?: Session
  special?: "logs"
  active: boolean
  onSelect: () => void
  onClose?: () => void
}
```

**Structure:**

```tsx
<button class={`session-tab ${active ? "active" : ""} ${special ? "special" : ""}`} onClick={onSelect}>
  <span class="tab-label">{special === "logs" ? "Logs" : session?.title || "Untitled"}</span>
  <Show when={!special && onClose}>
    <button
      class="tab-close"
      onClick={(e) => {
        e.stopPropagation()
        onClose?.()
      }}
    >
      ×
    </button>
  </Show>
</button>
```

**Styling:**

- Max width: 150px
- Truncate with ellipsis
- Active: Underline or bold text
- Logs tab: Slightly different color/icon

### 5. Add Tab State Management

**src/stores/ui.ts updates:**

```typescript
interface UIState {
  instanceTabOrder: string[]
  sessionTabOrder: Map<string, string[]>

  reorderInstanceTabs: (newOrder: string[]) => void
  reorderSessionTabs: (instanceId: string, newOrder: string[]) => void
}

const [instanceTabOrder, setInstanceTabOrder] = createSignal<string[]>([])
const [sessionTabOrder, setSessionTabOrder] = createSignal<Map<string, string[]>>(new Map())

function reorderInstanceTabs(newOrder: string[]) {
  setInstanceTabOrder(newOrder)
}

function reorderSessionTabs(instanceId: string, newOrder: string[]) {
  setSessionTabOrder((prev) => {
    const next = new Map(prev)
    next.set(instanceId, newOrder)
    return next
  })
}
```

### 6. Wire Up Tab Selection

**src/stores/instances.ts updates:**

```typescript
function setActiveInstance(id: string) {
  activeInstanceId = id

  // Auto-select first session or show session picker
  const instance = instances.get(id)
  if (instance) {
    const sessions = Array.from(instance.sessions.values())
    if (sessions.length > 0 && !instance.activeSessionId) {
      instance.activeSessionId = sessions[0].id
    }
  }
}

function setActiveSession(instanceId: string, sessionId: string) {
  const instance = instances.get(instanceId)
  if (instance) {
    instance.activeSessionId = sessionId
  }
}
```

### 7. Handle Tab Close Actions

**Close Instance Tab:**

```typescript
async function handleCloseInstance(instanceId: string) {
  const confirmed = await showConfirmDialog({
    title: "Stop OpenCode instance?",
    message: `This will stop the server for ${instance.folder}`,
    confirmText: "Stop Instance",
    destructive: true,
  })

  if (confirmed) {
    await removeInstance(instanceId)
  }
}
```

**Close Session Tab:**

```typescript
async function handleCloseSession(instanceId: string, sessionId: string) {
  const session = getInstance(instanceId)?.sessions.get(sessionId)

  if (session && session.messages.length > 0) {
    const confirmed = await showConfirmDialog({
      title: "Delete session?",
      message: `This will permanently delete "${session.title}"`,
      confirmText: "Delete",
      destructive: true,
    })

    if (!confirmed) return
  }

  await deleteSession(instanceId, sessionId)

  // Switch to another session
  const instance = getInstance(instanceId)
  const remainingSessions = Array.from(instance.sessions.values())
  if (remainingSessions.length > 0) {
    setActiveSession(instanceId, remainingSessions[0].id)
  } else {
    // Show session picker
    showSessionPicker(instanceId)
  }
}
```

### 8. Handle New Tab Buttons

**New Instance:**

```typescript
async function handleNewInstance() {
  const folder = await window.electronAPI.selectFolder()
  if (folder) {
    await createInstance(folder)
  }
}
```

**New Session:**

```typescript
async function handleNewSession(instanceId: string) {
  // For now, use default agent
  // Later (Task 011) will show agent selector
  const session = await createSession(instanceId, "build")
  setActiveSession(instanceId, session.id)
}
```

### 9. Update App Layout

**src/App.tsx:**

```tsx
<div class="app">
  <Show when={instances.size > 0} fallback={<EmptyState />}>
    <InstanceTabs
      instances={instances()}
      activeInstanceId={activeInstanceId()}
      onSelect={setActiveInstance}
      onClose={handleCloseInstance}
      onNew={handleNewInstance}
    />

    <Show when={activeInstance()}>
      {(instance) => (
        <>
          <SessionTabs
            instanceId={instance().id}
            sessions={instance().sessions}
            activeSessionId={instance().activeSessionId}
            onSelect={(id) => setActiveSession(instance().id, id)}
            onClose={(id) => handleCloseSession(instance().id, id)}
            onNew={() => handleNewSession(instance().id)}
          />

          <div class="content-area">
            {/* Message stream and input will go here in Task 007 */}
            <Show when={instance().activeSessionId === "logs"}>
              <LogsView logs={instance().logs} />
            </Show>
            <Show when={instance().activeSessionId !== "logs"}>
              <div class="placeholder">Session content will appear here (Task 007)</div>
            </Show>
          </div>
        </>
      )}
    </Show>
  </Show>
</div>
```

### 10. Add Keyboard Shortcuts

**Keyboard navigation:**

```typescript
// src/lib/keyboard.ts

export function setupTabKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    // Cmd/Ctrl + 1-9: Switch instance tabs
    if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
      e.preventDefault()
      const index = parseInt(e.key) - 1
      const instances = Array.from(instanceStore.instances.keys())
      if (instances[index]) {
        setActiveInstance(instances[index])
      }
    }

    // Cmd/Ctrl + N: New instance
    if ((e.metaKey || e.ctrlKey) && e.key === "n") {
      e.preventDefault()
      handleNewInstance()
    }

    // Cmd/Ctrl + T: New session
    if ((e.metaKey || e.ctrlKey) && e.key === "t") {
      e.preventDefault()
      if (activeInstanceId()) {
        handleNewSession(activeInstanceId()!)
      }
    }

    // Cmd/Ctrl + W: Close current tab
    if ((e.metaKey || e.ctrlKey) && e.key === "w") {
      e.preventDefault()
      const instanceId = activeInstanceId()
      const instance = getInstance(instanceId)
      if (instance?.activeSessionId && instance.activeSessionId !== "logs") {
        handleCloseSession(instanceId!, instance.activeSessionId)
      }
    }
  })
}
```

**Call in main.tsx:**

```typescript
import { setupTabKeyboardShortcuts } from "./lib/keyboard"

onMount(() => {
  setupTabKeyboardShortcuts()
})
```

### 11. Add Accessibility

**ARIA attributes:**

```tsx
<div role="tablist" aria-label="Instance tabs">
  <button
    role="tab"
    aria-selected={active}
    aria-controls={`instance-panel-${instance.id}`}
  >
    ...
  </button>
</div>

<div
  role="tabpanel"
  id={`instance-panel-${instance.id}`}
  aria-labelledby={`instance-tab-${instance.id}`}
>
  {/* Session tabs */}
</div>
```

**Focus management:**

- Tab key cycles through tabs
- Arrow keys navigate within tab list
- Focus indicators visible
- Skip links for screen readers

### 12. Style Refinements

**Horizontal scroll:**

```css
.tabs-container {
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.tabs-container::-webkit-scrollbar {
  height: 4px;
}

.tabs-container::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}
```

**Tab animations:**

```css
.instance-tab,
.session-tab {
  transition: background-color 150ms ease;
}

.instance-tab:hover,
.session-tab:hover {
  background-color: var(--hover-background);
}

.instance-tab.active,
.session-tab.active {
  background-color: var(--active-background);
}
```

**Close button styling:**

```css
.tab-close {
  opacity: 0;
  transition: opacity 150ms ease;
}

.instance-tab:hover .tab-close,
.session-tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background-color: var(--danger-background);
  color: var(--danger-color);
}
```

## Testing Checklist

**Manual Tests:**

1. Create instance → Instance tab appears
2. Click instance tab → Switches active instance
3. Session tabs appear below active instance
4. Click session tab → Switches active session
5. Click "+" on instance tabs → Opens folder picker
6. Click "+" on session tabs → Creates new session
7. Click close on instance tab → Shows confirmation, closes
8. Click close on session tab → Closes session
9. Cmd/Ctrl+1 switches to first instance
10. Cmd/Ctrl+N opens new instance
11. Cmd/Ctrl+T creates new session
12. Cmd/Ctrl+W closes active session
13. Tabs scroll when many exist
14. Logs tab always visible and non-closable
15. Tab labels truncate long names

**Edge Cases:**

- Only one instance (no scrolling needed)
- Many instances (>10, horizontal scroll)
- No sessions in instance (only Logs tab visible)
- Duplicate folder names (counter added)
- Very long folder/session names (ellipsis)
- Close last session (session picker appears)
- Switch instance while session is streaming

## Dependencies

- **Blocks:** Task 007 (needs tab structure to display messages)
- **Blocked by:** Task 005 (needs session selection to work)

## Estimated Time

4-5 hours

## Notes

- Keep tab design clean and minimal
- Don't over-engineer tab reordering (can add later)
- Focus on functionality over fancy animations
- Ensure keyboard accessibility from the start
- Tab state will persist in Task 017
- Context menus for tabs can be added in Task 026
