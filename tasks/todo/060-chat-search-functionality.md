# Task 060 - Chat Session Search Functionality

## Overview
Add a search function to enable users to find keywords within the current chat session. This feature provides quick navigation through conversation history with keyboard shortcuts and intuitive UI.

## User Stories
- As a user, I want to find specific keywords in my conversation to locate relevant information quickly
- As a user, I want to use keyboard shortcuts (Cmd+F/Ctrl+F) to initiate search, as I'm accustomed to from other applications
- As a user, I want to navigate through search results with arrow keys or dedicated navigation buttons
- As a user, I want to see search matches highlighted within the message content
- As a user, I want to know how many matches exist and which one I'm currently viewing

## Platform-Specific Shortcuts

| Platform | Shortcut | Purpose |
|----------|----------|---------|
| macOS    | ⌘ Cmd + F | Open search panel |
| Windows  | Ctrl + F | Open search panel |
| Linux    | Ctrl + F | Open search panel |

## Visual Design & UI Positioning

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Instance Tab │ Session Tab │ [Folder] │ Command Palette │ Status    │
└─────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 🔍 [_________________]  ◀ 3/15 > ⚙️     │   │
│  │   Search input         Prev/Next  Options  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ You                                                             │   │
│  │ How do I implement <mark class="search-match">search</mark> in  │   │
│  │ my application?                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Assistant                                                        │   │
│  │ To implement <mark class="search-match">search</mark>:           │   │
│  │                                                                 │   │
│  │ 1. Add a <mark class="search-match">search</mark> input field  │   │
│  │ 2. Handle keyboard shortcuts                                    │   │
│  │ 3. Highlight matches in real-time                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ You                                                             │   │
│  │ What about performance for large <mark class="search-match">    │   │
│  │ search</mark> queries?                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Search Panel Components

```
┌───────────────────────────────────────────────────────────────────────┐
│ 🔍 [Search input field................]  ◀ 3/15 > ⚙️                  │
│  ↑                                    ↑   ↑    ↑                     │
│  │                                    │   │    └─ Options dropdown    │
│  │                                    │   └───── Next match button   │
│  │                                    └────────── Previous match     │
│  └── Search icon + input                    Match counter           │
└───────────────────────────────────────────────────────────────────────┘
```

## Features

### Core Functionality
1. **Search Input**
   - Appears when Cmd+F/Ctrl+F is pressed
   - Text input field for search query
   - Auto-focus on panel open
   - Execute search on Enter key press (not as user types)
   - Case-insensitive by default
   - Optional: Case-sensitive toggle in options

2. **Match Navigation**
   - Keyboard navigation:
     - Enter: Go to next match
     - Shift+Enter: Go to previous match
     - Esc: Close search panel
   - Visual navigation buttons: Previous | Next
   - Match counter: Shows "current/total" (e.g., "3/15")
   - Auto-scroll to highlighted match
   - Wrap around search (cycle through results)

3. **Match Highlighting**
   - Highlight all matches in current session
   - Current match gets distinct highlight style
   - Other matches get subtle highlight
   - Works with markdown rendering
   - Preserves original text casing

4. **Search Scope**
   - Searches within current session only
   - Searches user and assistant messages
   - Searches text parts of messages
   - Ignores tool calls, file attachments, reasoning blocks (configurable)

5. **Search Options** (expandable dropdown)
   - Case sensitive toggle: Default OFF
   - Match whole word toggle: Default OFF
   - Search in tool outputs toggle: Default OFF
   - Search in reasoning blocks toggle: Default OFF

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+F / Ctrl+F | Open/focus search panel |
| Enter | Navigate to next match |
| Shift+Enter | Navigate to previous match |
| ↑ / ↓ | Navigate to previous/next match |
| Esc | Close search panel |
| Cmd+G / Ctrl+G | Next match (alternative) |
| Cmd+Shift+G / Ctrl+Shift+G | Previous match (alternative) |

**Note:** Search panel ONLY closes when user presses Esc or clicks the X close button. Clicking outside does NOT close the panel.

### User Experience Flows

#### Flow 1: Quick Search
1. User presses Cmd+F/Ctrl+F
2. Search panel appears, input focused
3. User types "search query"
4. All matches highlighted immediately
5. Current match shown with distinct highlight
6. Counter shows "3/15" (3rd of 15 matches)
7. Messages auto-scroll to show current match

#### Flow 2: Navigate Results
1. Search panel is open with results
2. User presses Enter or clicks "Next" button
3. View scrolls to next match
4. Counter updates: "4/15"
5. Repeat until last match, then wraps to first

#### Flow 3: Close Search
1. User presses Esc OR clicks X close button
2. Search panel closes
3. All highlights removed
4. Focus returns to previous element (prompt input or message list)

**Important:** Clicking outside search panel does NOT close it. Only Esc or X button closes panel.

## Technical Implementation

### Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         Search Feature                             │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Search Panel │◄───│ Search Store │◄───│  Keyboard    │       │
│  │  Component   │    │   & State    │    │  Registry    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                                     │                   │
│         │                                     │                   │
│         ▼                                     ▚                   │
│  ┌──────────────┐                     ┌──────────────────┐      │
│  │ Search       │────────────────────▶│ Session Messages │      │
│  │ Highlighting  │                     │   (from store)   │      │
│  └──────────────┘                     └──────────────────┘      │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### File Structure

```
packages/ui/src/
├── stores/
│   └── search-store.ts                    # NEW: Search state management
├── components/
│   ├── search-panel.tsx                   # NEW: Search UI component
│   ├── search-highlight-overlay.tsx       # NEW: Highlight renderer
│   └── session/
│       └── session-view.tsx               # MODIFIED: Integrate search
├── lib/
│   └── shortcuts/
│       └── search.ts                      # NEW: Keyboard shortcut registration
├── types/
│   └── search.ts                          # NEW: Search type definitions
└── styles/
    └── components/
        └── search-panel.css               # NEW: Search panel styles
```

### Core Components

#### 1. Search Store (`search-store.ts`)
```typescript
interface SearchState {
  query: string
  isOpen: boolean
  matches: SearchMatch[]
  currentIndex: number
  options: SearchOptions
  instanceId: string | null
  sessionId: string | null
}

interface SearchMatch {
  messageId: string
  partIndex: number
  startIndex: number
  endIndex: number
  text: string
  isCurrent: boolean
}

interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  includeToolOutputs: boolean
  includeReasoning: boolean
}
```

**Key Functions:**
- `searchMessages(query, instanceId, sessionId)` - Perform search
- `navigateNext()` - Move to next match
- `navigatePrevious()` - Move to previous match
- `openSearch()` - Open search panel
- `closeSearch()` - Close search panel
- `updateOptions(options)` - Update search options

#### 2. Search Panel Component (`search-panel.tsx`)
- Floating overlay at top of message area
- Input field with search query
- Navigation buttons (Previous | Next)
- Match counter display
- Options dropdown (gear icon)
- Keyboard interaction handling

#### 3. Search Highlighter (`search-highlight-overlay.tsx`)
- Wraps message content
- Injects `<mark>` tags for matches
- Distinguishes current vs. other matches
- Works with existing markdown renderer
- Avoids breaking HTML structure

#### 4. Keyboard Shortcuts (`search.ts`)
```typescript
{
  id: "search-open",
  key: "f",
  modifiers: {
    ctrl: !isMac(),
    meta: isMac()
  },
  handler: () => openSearch(),
  context: "global"
}
```

### Search Algorithm

```typescript
function findMatches(
  text: string,
  query: string,
  options: SearchOptions
): SearchMatch[] {
  if (!query || query.length < 1) return []

  let searchText = text
  let searchQuery = query

  if (!options.caseSensitive) {
    searchText = text.toLowerCase()
    searchQuery = query.toLowerCase()
  }

  if (options.wholeWord) {
    const regex = new RegExp(`\\b${escapeRegex(searchQuery)}\\b`, 'g')
    const matches = [...searchText.matchAll(regex)]
    return matches.map(m => ({
      startIndex: m.index!,
      endIndex: m.index! + searchQuery.length
    }))
  } else {
    const matches = []
    let index = 0
    while (true) {
      index = searchText.indexOf(searchQuery, index)
      if (index === -1) break
      matches.push({ startIndex: index, endIndex: index + searchQuery.length })
      index += 1
    }
    return matches
  }
}
```

### Message Component Integration

Modify `message-item.tsx` and `message-part.tsx` to accept search matches:

```typescript
interface MessageItemProps {
  // ... existing props
  searchMatches?: MessageMatchMap  // NEW
}

interface MessageMatchMap {
  [messageId: string]: {
    currentMatchIndex: number | null
    matches: Array<{ partIndex: number; startIndex: number; endIndex: number }>
  }
}
```

### Styling Tokens

Add to `tokens.css`:
```css
/* Search highlights */
--search-match-bg: rgba(255, 215, 0, 0.4);
--search-match-current-bg: rgba(255, 165, 0, 0.6);
--search-match-text: var(--text-primary);
--search-match-border: rgba(255, 165, 0, 0.5);

/* Search panel */
--search-panel-bg: var(--surface-base);
--search-panel-border: var(--border-base);
--search-panel-shadow: var(--scroll-elevation-shadow);
```

### Performance Considerations

1. **No Debounce - Wait for User Action**
   - Do NOT execute search while typing
   - Only execute search when user presses Enter
   - Prevent unnecessary re-renders and performance overhead

2. **Message Caching**
   - Cache rendered messages
   - Only re-render when matches change
   - Use SolidJS reactivity efficiently

3. **Lazy Highlighting**
   - Only highlight matches currently visible in viewport
   - Highlight remaining matches when scrolling
   - Use Intersection Observer for visibility detection

4. **Search Result Limiting**
   - Limit to first 100 matches to prevent UI freeze
   - Show "100+ matches" message if exceeded
   - Provide option to show all if user requested

### Accessibility

1. **Keyboard Navigation**
   - All functionality accessible via keyboard
   - Clear focus indicators
   - ARIA labels for buttons

2. **Screen Reader Support**
   - Live region for match count updates
   - ARIA-live announcements for navigation
   - Descriptive labels for search input

3. **Visual Accessibility**
   - High contrast for highlights
   - Respect reduced motion preferences
   - Keyboard shortcuts in UI tooltips

### Edge Cases

1. **Empty Query**
   - Clear all highlights
   - Show "No matches" message or keep panel empty

2. **No Matches Found**
   - Display "No matches found" message
   - Disable navigation buttons
   - Show counter as "0/0"

3. **Query Cleared**
   - Remove all highlights
   - Reset current index
   - Keep panel open for new search

4. **Session Change**
   - Clear search results
   - Reset to closed state
   - Remove highlights from old session

5. **Message Deleted/Updated**
   - Re-run search with current query
   - Update match positions
   - Handle disappearing matches gracefully

6. **Very Long Messages**
   - Performance optimization (lazy highlighting)
   - Virtual scrolling for large message lists
   - Limit display to 100 matches with option to show all

## Testing

### Unit Tests
- Search algorithm correctness (case-sensitive, whole-word, etc.)
- Match position calculation
- Index boundary handling
- State management in search store

### Integration Tests
- Keyboard shortcut registration and execution
- Search panel open/close behavior
- Navigation between matches
- Highlighting in message components
- Session switching clears search

### Manual Testing Checklist
- [ ] Cmd+F/Ctrl+F opens search panel
- [ ] Input is auto-focused on open
- [ ] Real-time search works as typing
- [ ] Matches are highlighted correctly
- [ ] Current match has distinct style
- [ ] Match counter displays correctly
- [ ] Navigation buttons work
- [ ] Keyboard navigation (Enter, Shift+Enter, arrows)
- [ ] Esc closes search panel
- [ ] Highlights are removed on close
- [ ] Options toggle works (case-sensitive, whole-word)
- [ ] Search works with markdown content
- [ ] Auto-scroll to match works
- [ ] Session switch clears search
- [ ] No search in tool outputs (default)
- [ ] Toggle search in tool outputs works
- [ ] Keyboard shortcuts displayed in command palette

## Dependencies

### Code Dependencies
- Message store (`message-v2/instance-store.ts`)
- Session store
- Keyboard registry
- Message components (`message-item.tsx`, `message-part.tsx`)
- Session view component

### External Dependencies
- None (uses existing SolidJS patterns)

## Success Criteria

1. ✅ Search panel opens with Cmd+F/Ctrl+F
2. ✅ Real-time search as user types
3. ✅ Matches highlighted in messages
4. ✅ Current match distinguished from others
5. ✅ Navigation between previous/next matches
6. ✅ Keyboard shortcuts work (Enter, Shift+Enter, Esc)
7. ✅ Match counter shows current/total
8. ✅ Search options (case-sensitive, whole-word) work
9. ✅ Scroll to match on navigation
10. ✅ Session switch clears search
11. ✅ Works in light and dark mode
12. ✅ Accessible via keyboard and screen reader
13. ✅ No performance issues with 100+ messages
14. ✅ Highlights don't break markdown rendering

## Future Enhancements

### Phase 2 Features (Post-MVP)
1. **Advanced Search Options**
   - Regular expression support
   - Wildcard search
   - Date range filter
   - Message type filter (user/assistant only)

2. **Search Across Sessions**
   - "Search in all sessions" toggle
   - Switch to session when match selected
   - Global search modal

3. **Search History**
   - Remember recent searches
   - Quick access to previous queries
   - Saved search filters

4. **Export Results**
   - Copy matches to clipboard
   - Export to text/CSV
   - Print search results

5. **Fuzzy Search**
   - Approximate matching
   - Typo tolerance
   - Relevance scoring

6. **Voice Search**
   - Dictate search query
   - Voice commands for navigation

### Phase 3 Features
1. **AI-Powered Search**
   - Semantic search (not keyword-only)
   - Concept matching
   - Related suggestions

2. **Search Analytics**
   - Most searched topics
   - Search patterns
   - User behavior insights

## Estimated Implementation Time

**Total: 16-20 hours**

- Core search logic: 3-4 hours
- Search panel component: 4-5 hours
- Message highlighting integration: 3-4 hours
- Keyboard shortcuts: 1 hour
- Styling & theming: 2 hours
- Testing & refinement: 3 hours

### Breakdown by Phase
- Phase 1 (MVP): 16-20 hours
- Phase 2 enhancements: 8-12 hours
- Phase 3 features: 12-16 hours

## Implementation Priority

### P0 (Must Have for MVP)
- Search input panel
- Basic text search (case-insensitive)
- Match highlighting
- Navigation (Previous/Next)
- Keyboard shortcuts (Cmd/F, Enter, Esc)
- Match counter

### P1 (Important for Good UX)
- Search options (case-sensitive, whole-word)
- Auto-scroll to match
- Current match distinction
- Session switch handling
- Performance optimizations

### P2 (Nice to Have)
- Search history
- Regex support
- Search in tool outputs
- Advanced options

## Risks & Mitigation

### Risk 1: Performance with Large Session
- **Issue**: 1000+ messages could cause lag
- **Mitigation**: Debounce search, lazy highlighting, limit matches

### Risk 2: Breaking Markdown Rendering
- **Issue**: Highlight injection could break HTML
- **Mitigation**: Use text-only highlighting, test with various markdown

### Risk 3: Platform Shortcut Conflicts
- **Issue**: Cmd+F/Ctrl+F conflicts with browser or OS
- **Mitigation**: Use `preventDefault()` carefully, respect system shortcuts

### Risk 4: Accessibility Issues
- **Issue**: Highlights not visible to screen readers
- **Mitigation**: ARIA-live announcements, keyboard navigation, proper labels

## Documentation Needs

1. **User Documentation**
   - Search feature guide
   - Keyboard shortcuts reference
   - Troubleshooting tips

2. **Developer Documentation**
   - API reference for search store
   - Component integration guide
   - Performance considerations

3. **Release Notes**
   - Feature announcement
   - Keyboard shortcut summary
   - Usage examples

## Open Questions - RESOLVED

1. Should search persist across session reload?
   - **Decision**: NO - Clear search on session reload

2. Should we support saving/bookmarking specific search results?
   - **Decision**: NO - Not in scope for MVP

3. Should we add search to command palette as an action?
   - **Decision**: NO - Use Ctrl+F/Cmd+F shortcut only

4. Should search be available in logs tab as well?
   - **Decision**: NO - Only for chat sessions

5. Should we show search matches in session list preview?
   - **Decision**: CONDITIONAL - Only if easy to implement without adding complexity
   - If implementation is complex, skip to avoid breaking existing logic

---

**Status**: PLANNING  
**Priority**: HIGH  
**Complexity**: MEDIUM  
**Est. Hours**: 16-20  
**Assigned**: TBD  
**Due**: TBD
