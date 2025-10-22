# Task 002: Empty State UI & Folder Selection

## Goal

Create the initial empty state interface that appears when no instances are running, with folder selection capability.

## Prerequisites

- Task 001 completed (project setup)
- Basic understanding of SolidJS components
- Electron IPC understanding

## Acceptance Criteria

- [ ] Empty state displays when no instances exist
- [ ] "Select Folder" button visible and styled
- [ ] Clicking button triggers Electron dialog
- [ ] Selected folder path displays temporarily
- [ ] UI matches design spec (centered, clean)
- [ ] Keyboard shortcut Cmd/Ctrl+N works
- [ ] Error handling for cancelled selection

## Steps

### 1. Create Empty State Component

**src/components/empty-state.tsx:**

**Structure:**

- Centered container
- Large folder icon (from lucide-solid)
- Heading: "Welcome to OpenCode Client"
- Subheading: "Select a folder to start coding with AI"
- Primary button: "Select Folder"
- Helper text: "Keyboard shortcut: Cmd/Ctrl+N"

**Styling:**

- Use TailwindCSS utilities
- Center vertically and horizontally
- Max width: 500px
- Padding: 32px
- Icon size: 64px
- Text sizes: Heading 24px, body 16px, helper 14px
- Colors: Follow design spec (light/dark mode)

**Props:**

- `onSelectFolder: () => void` - Callback when button clicked

### 2. Create UI Store

**src/stores/ui.ts:**

**State:**

```typescript
interface UIStore {
  hasInstances: boolean
  selectedFolder: string | null
  isSelectingFolder: boolean
}
```

**Signals:**

- `hasInstances` - Reactive boolean
- `selectedFolder` - Reactive string or null
- `isSelectingFolder` - Reactive boolean (loading state)

**Actions:**

- `setHasInstances(value: boolean)`
- `setSelectedFolder(path: string | null)`
- `setIsSelectingFolder(value: boolean)`

### 3. Implement IPC for Folder Selection

**electron/main/main.ts additions:**

**IPC Handler:**

- Register handler for 'dialog:selectFolder'
- Use `dialog.showOpenDialog()` with:
  - `properties: ['openDirectory']`
  - Title: "Select Project Folder"
  - Button label: "Select"
- Return selected folder path or null if cancelled
- Handle errors gracefully

**electron/preload/index.ts additions:**

**Expose method:**

```typescript
electronAPI: {
  selectFolder: () => Promise<string | null>
}
```

**Type definitions:**

```typescript
interface ElectronAPI {
  selectFolder: () => Promise<string | null>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

### 4. Update App Component

**src/App.tsx:**

**Logic:**

- Import UI store
- Import EmptyState component
- Check if `hasInstances` is false
- If false, render EmptyState
- If true, render placeholder for instance UI (future)

**Folder selection handler:**

```typescript
async function handleSelectFolder() {
  setIsSelectingFolder(true)
  try {
    const folder = await window.electronAPI.selectFolder()
    if (folder) {
      setSelectedFolder(folder)
      // TODO: Will trigger instance creation in Task 003
      console.log("Selected folder:", folder)
    }
  } catch (error) {
    console.error("Folder selection failed:", error)
    // TODO: Show error toast (Task 010)
  } finally {
    setIsSelectingFolder(false)
  }
}
```

### 5. Add Keyboard Shortcut

**electron/main/menu.ts (new file):**

**Create application menu:**

- File menu:
  - New Instance (Cmd/Ctrl+N)
    - Click: Send 'menu:newInstance' to renderer
  - Separator
  - Quit (Cmd/Ctrl+Q)

**Platform-specific menu:**

- macOS: Include app menu with About, Hide, etc.
- Windows/Linux: Standard File menu

**Register menu in main.ts:**

- Import Menu, buildFromTemplate
- Create menu structure
- Set as application menu

**electron/preload/index.ts additions:**

```typescript
electronAPI: {
  onNewInstance: (callback: () => void) => void
}
```

**src/App.tsx additions:**

- Listen for 'newInstance' event
- Trigger handleSelectFolder when received

### 6. Add Loading State

**Button states:**

- Default: "Select Folder"
- Loading: "Selecting..." with spinner icon
- Disabled when isSelectingFolder is true

**Spinner component:**

- Use lucide-solid Loader2 icon
- Add spin animation class
- Size: 16px

### 7. Add Validation

**Folder validation (in handler):**

- Check if folder exists
- Check if readable
- Check if it's actually a directory
- Show appropriate error if invalid

**Error messages:**

- "Folder does not exist"
- "Cannot access folder (permission denied)"
- "Please select a directory, not a file"

### 8. Style Refinements

**Responsive behavior:**

- Works at minimum window size (800x600)
- Maintains centering
- Text remains readable

**Accessibility:**

- Button has proper ARIA labels
- Keyboard focus visible
- Screen reader friendly text

**Theme support:**

- Test in light mode
- Test in dark mode (use prefers-color-scheme)
- Icons and text have proper contrast

### 9. Add Helpful Context

**Additional helper text:**

- "Examples: ~/projects/my-app"
- "You can have multiple instances of the same folder"

**Icon improvements:**

- Use animated folder icon (optional)
- Add subtle entrance animation (fade in)

## Testing Checklist

**Manual Tests:**

1. Launch app → Empty state appears
2. Click "Select Folder" → Dialog opens
3. Select folder → Path logged to console
4. Cancel dialog → No error, back to empty state
5. Press Cmd/Ctrl+N → Dialog opens
6. Select non-directory → Error shown
7. Select restricted folder → Permission error shown
8. Resize window → Layout stays centered

**Edge Cases:**

- Very long folder paths (ellipsis)
- Special characters in folder name
- Folder on network drive
- Folder that gets deleted while selected

## Dependencies

- **Blocks:** Task 003 (needs folder path to create instance)
- **Blocked by:** Task 001 (needs project setup)

## Estimated Time

2-3 hours

## Notes

- Keep UI simple and clean
- Focus on UX - clear messaging
- Don't implement instance creation yet (that's Task 003)
- Log selected folder to console for verification
- Prepare for state management patterns used in later tasks
