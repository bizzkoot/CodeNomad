# Diff View Side-by-Side Rendering Analysis & MVP Improvement Plan

## Executive Summary

The session chat diff viewer uses `@git-diff-view/solid` library (v0.0.8, latest is v0.0.9) to render diffs in two modes:
- **Unified**: Working correctly
- **Split/Side-by-Side**: Not rendering properly

This document analyzes issues and provides an MVP improvement plan.

---

## Current Implementation Analysis

### Components Involved

1. **[`diff-viewer.tsx`](packages/ui/src/components/diff-viewer.tsx)** - Main diff rendering component
   - Uses `@git-diff-view/solid` library
   - Supports both `DiffModeEnum.Split` and `DiffModeEnum.Unified`
   - Implements caching for performance

2. **[`tool-call.tsx`](packages/ui/src/components/tool-call.tsx)** - Tool call container with diff rendering
   - Provides toolbar with mode toggle buttons
   - Manages diff view mode preference

3. **[`tool-call.css`](packages/ui/src/styles/messaging/tool-call.css)** - Styling for diff views
   - Contains `.tool-call-diff-shell` and `.tool-call-diff-viewer` classes

### Library Configuration

```tsx
// From diff-viewer.tsx
<DiffView
  data={data()}
  diffViewMode={props.mode === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified}
  diffViewTheme={props.theme}
  diffViewHighlight
  diffViewWrap={false}
  diffViewFontSize={13}
/>
```

### Data Structure

The diff viewer receives:
```tsx
{
  oldFile: { fileName, fileLang },
  newFile: { fileName, fileLang },
  hunks: [normalizedDiffText]
}
```

**Note**: Only hunks (diff text) are provided, not full file content. The library should generate old/new file content from hunks.

---

## Root Cause Analysis

### Issue 1: CSS Overflow Conflict (PRIMARY ISSUE)

**Location**: [`tool-call.css`](packages/ui/src/styles/messaging/tool-call.css:227-230)

```css
/* Diff shell already provides the scroll container.
   Avoid nested scroll areas inside the diff viewer. */
.tool-call-diff-shell .tool-call-diff-viewer {
  max-height: none;
  overflow: visible;  /* ← THIS BREAKS SPLIT VIEW */
}
```

**Problem**: The split view from `@git-diff-view/solid` relies on specific overflow settings:
- `.overflow-x-auto` for horizontal scrolling
- `.overflow-y-hidden` for vertical scrolling (table handles it)

When the app overrides this to `overflow: visible`, the split view's table-based layout loses its scrolling behavior.

**Why unified works but split doesn't**:
- Unified view uses a single column layout that doesn't require special overflow handling
- Split view uses a table with two columns that needs proper overflow settings

### Issue 2: Missing File Content

**Location**: [`diff-viewer.tsx`](packages/ui/src/components/diff-viewer.tsx:41-61)

The diff data only includes hunks (diff text), not full file content:
```tsx
return {
  oldFile: { fileName, fileLang },
  newFile: { fileName, fileLang },
  hunks: [normalized],
}
```

The library documentation states it can generate content from hunks, but this may not work correctly for split view rendering.

### Issue 3: Library Version

**Current**: `@git-diff-view/solid@^0.0.8`

This is an early version (0.0.x) which may have bugs in split view rendering. Checking for newer versions with bug fixes could resolve issues.

### Issue 4: Container Width Constraints

**Location**: [`tool-call.css`](packages/ui/src/styles/messaging/tool-call.css:206-214)

```css
.tool-call-diff-viewer {
  max-height: var(--tool-call-max-height-large, calc(48 * 1.4em));
  overflow: auto;
  background-color: var(--surface-code);
}
```

The split view table needs explicit width constraints to ensure 50/50 column distribution. Without proper width settings, columns may collapse.

---

## Best Practices from Established Apps

### GitHub's Diff Viewer
- Table-based layout with two columns for split view
- Independent horizontal scrolling per pane
- Synchronized vertical scrolling
- Line numbers in gutter
- Word-level highlighting for changes

### VSCode's Diff Viewer
- Similar table-based layout
- Supports both inline and side-by-side views
- Handles file additions/deletions gracefully
- Expandable/collapsible hunks

### GitLab's Diff Viewer
- Table-based layout
- Expandable/collapsible hunks
- Shows file statistics
- Supports parallel diff view

**Common Pattern**: All use table-based layout with specific overflow settings for split view.

---

## MVP Improvement Plan

### Phase 1: CSS Fix (QUICK WIN - 15 min) ✅ COMPLETED

**Goal**: Fix the overflow conflict that breaks split view rendering.

**Action**: Modified [`tool-call.css`](packages/ui/src/styles/messaging/tool-call.css) to preserve library's overflow settings for split view.

```css
/* Diff shell already provides the scroll container.
   Avoid nested scroll areas inside the diff viewer. */
.tool-call-diff-shell .tool-call-diff-viewer {
  max-height: none;
  /* Preserve library's overflow settings for split view */
  overflow: auto;  /* Changed from visible */
}

/* Ensure split view table has proper width constraints */
.tool-call-diff-viewer .diff-tailwindcss-wrapper {
  width: 100%;
  min-width: 0;
}
```

**Rationale**: This is the minimal change needed to make split view work. By restoring `overflow: auto`, the library's split view can properly handle scrolling.

**Status**: ✅ Implemented and committed (commit 2c447f5)

### Phase 2: Enhanced Split View Styling (OPTIONAL - 30 min) ✅ COMPLETED

**Goal**: Improve split view appearance and usability.

**Actions**:
1. Add specific styles for split view columns
2. Ensure proper border between panes
3. Improve line number alignment
4. Add visual indicators for additions/deletions

```css
/* Split view specific styles */
.tool-call-diff-viewer .diff-tailwindcss-wrapper table {
  table-layout: fixed;
}

.tool-call-diff-viewer .diff-tailwindcss-wrapper td {
  min-width: 0;
}

/* Border between split panes */
.tool-call-diff-viewer .diff-line-old-content {
  border-right: 1px solid var(--border-base);
}

.tool-call-diff-viewer .diff-line-new-content {
  border-right: none;
}
```

**Status**: ✅ Implemented and committed (commit 02ec5c3)

### Phase 3: Library Upgrade (OPTIONAL - 1 hour) ✅ COMPLETED

**Goal**: Check if newer library versions fix split view issues.

**Findings**:
- Current version: `@git-diff-view/solid@^0.0.8`
- Latest version: `@git-diff-view/solid@0.0.9` (released 2026-01-08)
- Version 0.0.9 is a minor patch update, likely containing bug fixes

**Recommendation**:
- Skip library upgrade for now
- Let user test Phase 1 & 2 fixes first
- If split view still has issues after testing, consider upgrading to 0.0.9
- Document any issues found during testing for future investigation

**Risk**: May introduce breaking changes. Only upgrade if necessary after testing current fixes.

**Status**: ✅ Checked - no upgrade needed at this time

### Phase 4: Enhanced Data Structure (OPTIONAL - 2 hours) ⏭ DEFERRED

**Goal**: Provide full file content to improve split view rendering.

**Actions**:
1. Modify backend to provide full old/new file content
2. Update diff data structure to include content
3. Pass content to DiffView component

**Risk**: Requires backend changes. Only do if necessary.

**Status**: ⏭ Deferred - test Phase 1 & 2 first

---

## Implementation Status

| Phase | Status | Commit |
|-------|---------|---------|
| Phase 1 | ✅ COMPLETED | 2c447f5 |
| Phase 2 | ✅ COMPLETED | 02ec5c3 |
| Phase 3 | ✅ COMPLETED | N/A (research only) |
| Phase 4 | ⏭ DEFERRED | N/A |

---

## Implementation Priority

| Phase | Impact | Effort | Risk | Priority |
|-------|---------|--------|-------|----------|
| Phase 1 | HIGH | LOW | LOW | **P0** |
| Phase 2 | MEDIUM | LOW | LOW | P1 |
| Phase 3 | MEDIUM | MEDIUM | MEDIUM | P2 |
| Phase 4 | LOW | HIGH | HIGH | P3 |

---

## Testing Checklist

After implementing Phase 1, verify:

- [ ] Split view renders correctly with two panes
- [ ] Horizontal scrolling works in both panes
- [ ] Vertical scrolling works (synchronized)
- [ ] Line numbers are visible and aligned
- [ ] Added lines have green background
- [ ] Removed lines have red background
- [ ] Context lines are visible on both sides
- [ ] Toggle between unified and split works
- [ ] Theme switching works (light/dark)
- [ ] Diff caching still works
- [ ] No console errors

---

## Fallback Strategy

If Phase 1 doesn't fully resolve the issue:

1. **Disable split view temporarily**: Hide the split view button until fixed
2. **Show warning**: Display a message when split view is selected
3. **Use unified view by default**: Ensure unified view works perfectly

```tsx
// In tool-call.tsx
const isSplitViewBroken = () => {
  // Check if split view is broken
  return false; // Set to true if needed
}

<Show when={!isSplitViewBroken()}>
  <button onClick={() => handleModeChange("split")}>Split</button>
</Show>
```

---

## Conclusion

The primary issue with split view rendering is a CSS overflow conflict in [`tool-call.css`](packages/ui/src/styles/messaging/tool-call.css:229). By changing `overflow: visible` to `overflow: auto`, split view should render correctly.

**Recommended Action**: Implement Phase 1 (CSS fix) as the MVP solution. This is a low-risk, high-impact change that should resolve the issue without requiring backend changes or library upgrades.

**Implementation Status**: Phases 1 & 2 have been successfully implemented and committed. Phase 3 (library upgrade check) has been completed with recommendation to defer. Phase 4 (enhanced data structure) is deferred pending testing results.

**Next Steps**: User should test the implemented changes in their environment. If split view works correctly, no further action is needed. If issues persist, consider:
1. Upgrading to `@git-diff-view/solid@0.0.9`
2. Implementing Phase 4 (enhanced data structure)
3. Adding fallback strategy for broken split view

**Future Improvements**: Consider Phase 2-4 for enhanced functionality if needed.
