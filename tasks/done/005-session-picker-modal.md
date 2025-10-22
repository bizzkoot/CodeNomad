# Task 005: Session Picker Modal

## Goal

Create the session picker modal that appears when an instance starts, allowing users to resume an existing session or create a new one.

## Prerequisites

- Task 004 completed (SDK integration, session fetching)
- Understanding of modal/dialog patterns
- Kobalte UI primitives knowledge

## Acceptance Criteria

- [ ] Modal appears after instance becomes ready
- [ ] Displays list of existing sessions
- [ ] Shows session metadata (title, timestamp)
- [ ] Allows creating new session with agent selection
- [ ] Can close modal (cancels instance creation)
- [ ] Keyboard navigation works (up/down, enter)
- [ ] Properly styled and accessible
- [ ] Loading states during fetch

## Steps

### 1. Create Session Picker Component

**src/components/session-picker.tsx:**

**Props:**

```typescript
interface SessionPickerProps {
  instanceId: string
  open: boolean
  onClose: () => void
  onSessionSelect: (sessionId: string) => void
  onNewSession: (agent: string) => void
}
```

**Structure:**

- Modal backdrop (semi-transparent overlay)
- Modal dialog (centered card)
- Header: "OpenCode • {folder}"
- Section 1: Resume session list
- Separator: "or"
- Section 2: Create new session
- Footer: Cancel button

### 2. Use Kobalte Dialog

**Implementation approach:**

```typescript
import { Dialog } from '@kobalte/core'

<Dialog.Root open={props.open} onOpenChange={(open) => !open && props.onClose()}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      {/* Modal content */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

**Styling:**

- Overlay: Dark background, 50% opacity
- Content: White card, max-width 500px, centered
- Padding: 24px
- Border radius: 8px
- Shadow: Large elevation

### 3. Create Session List Section

**Resume Section:**

- Header: "Resume a session:"
- List of sessions (max 10 recent)
- Each item shows:
  - Title (truncated at 50 chars)
  - Relative timestamp ("2h ago")
  - Hover state
  - Active selection state

**Session Item Component:**

```typescript
interface SessionItemProps {
  session: Session
  selected: boolean
  onClick: () => void
}
```

**Empty state:**

- Show when no sessions exist
- Text: "No previous sessions"
- Muted styling

**Scrollable:**

- If >5 sessions, add scroll
- Max height: 300px

### 4. Create New Session Section

**Structure:**

- Header: "Start new session:"
- Agent selector dropdown
- "Start" button

**Agent Selector:**

- Dropdown using Kobalte Select
- Shows agent name
- Grouped by category if applicable
- Default: "Build" agent

**Start Button:**

- Primary button style
- Click triggers onNewSession callback
- Disabled while creating

### 5. Add Loading States

**While fetching sessions:**

- Show skeleton list (3-4 placeholder items)
- Shimmer animation

**While fetching agents:**

- Agent dropdown shows "Loading..."
- Disabled state

**While creating session:**

- Start button shows spinner
- Disabled state
- Text changes to "Creating..."

### 6. Wire Up to Instance Store

**Show modal after instance ready:**

**src/stores/ui.ts additions:**

```typescript
interface UIStore {
  sessionPickerInstance: string | null
}

function showSessionPicker(instanceId: string) {
  sessionPickerInstance = instanceId
}

function hideSessionPicker() {
  sessionPickerInstance = null
}
```

**src/stores/instances.ts updates:**

```typescript
async function createInstance(folder: string) {
  // ... spawn and connect ...

  // Show session picker
  showSessionPicker(id)

  return id
}
```

### 7. Handle Session Selection

**Resume session:**

```typescript
function handleSessionSelect(sessionId: string) {
  setActiveSession(instanceId, sessionId)
  hideSessionPicker()

  // Will trigger session display in Task 006
}
```

**Create new session:**

```typescript
async function handleNewSession(agent: string) {
  try {
    const session = await createSession(instanceId, agent)
    setActiveSession(instanceId, session.id)
    hideSessionPicker()
  } catch (error) {
    // Show error toast (Task 010)
    console.error("Failed to create session:", error)
  }
}
```

### 8. Handle Cancel

**Close modal:**

```typescript
function handleClose() {
  // Remove instance since user cancelled
  await removeInstance(instanceId)
  hideSessionPicker()
}
```

**Confirmation if needed:**

- If server already started, ask "Stop server?"
- Otherwise, just close

### 9. Add Keyboard Navigation

**Keyboard shortcuts:**

- Up/Down: Navigate session list
- Enter: Select highlighted session
- Escape: Close modal (cancel)
- Tab: Cycle through sections

**Implement focus management:**

- Auto-focus first session on open
- Trap focus within modal
- Restore focus on close

### 10. Add Accessibility

**ARIA attributes:**

- `role="dialog"`
- `aria-labelledby="dialog-title"`
- `aria-describedby="dialog-description"`
- `aria-modal="true"`

**Screen reader support:**

- Announce "X sessions available"
- Announce selection changes
- Clear focus indicators

### 11. Style Refinements

**Light/Dark mode:**

- Test in both themes
- Ensure contrast meets WCAG AA
- Use CSS variables for colors

**Responsive:**

- Works at minimum window size
- Mobile-friendly (future web version)
- Scales text appropriately

**Animations:**

- Fade in backdrop (200ms)
- Scale in content (200ms)
- Smooth transitions on hover

### 12. Update App Component

**src/App.tsx:**

**Render session picker:**

```typescript
<Show when={ui.sessionPickerInstance}>
  {(instanceId) => (
    <SessionPicker
      instanceId={instanceId()}
      open={true}
      onClose={() => ui.hideSessionPicker()}
      onSessionSelect={(id) => handleSessionSelect(instanceId(), id)}
      onNewSession={(agent) => handleNewSession(instanceId(), agent)}
    />
  )}
</Show>
```

## Testing Checklist

**Manual Tests:**

1. Create instance → Modal appears
2. Shows session list if sessions exist
3. Shows empty state if no sessions
4. Click session → Modal closes, session activates
5. Select agent, click Start → New session created
6. Press Escape → Modal closes, instance removed
7. Keyboard navigation works
8. Screen reader announces content

**Edge Cases:**

- No sessions + no agents (error state)
- Very long session titles (truncate)
- Many sessions (scroll works)
- Create session fails (error shown)
- Slow network (loading states)

## Dependencies

- **Blocks:** Task 006 (needs active session)
- **Blocked by:** Task 004 (needs session data)

## Estimated Time

3-4 hours

## Notes

- Keep modal simple and focused
- Clear call-to-action
- Don't overwhelm with options
- Loading states crucial for UX
- Consider adding search if >20 sessions (future)
