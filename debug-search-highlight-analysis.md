# Search Highlight Debugging Analysis

## Problem Statement
When searching for text with multiple occurrences in the SAME panel/card:
- **Only 1st occurrence gets full highlight** (fill shading + outline)
- **Subsequent occurrences get only fill shading**, NO outline
- **Navigation works across different panels correctly** (all get proper highlight)

## Root Cause Hypothesis

### Primary Hypothesis: Incorrect Occurrence Index Calculation in Markdown Component

The issue is likely in the `Markdown` component's `applySearchHighlights` function. When creating marks for search matches, it uses an `occurrenceIndex` counted across text nodes, but when selecting the current match, it calculates the `localIndex` differently.

#### Expected Flow:
1. User search finds 3 matches at indices: 0, 1, 2 (globally)
2. All 3 matches are in the same message part
3. When navigating to match 0:
   - `globalCurrentIndex = 0`
   - `currentMatch = allMatches[0]` (startIndex: 10, endIndex: 15)
   - `partMatches` contains the 3 matches for this part
   - `localIndex = findIndex` finds occurrence 0 in the sorted part matches
   - `occurrenceIndex = 0` (calculated by the component)
   - Selects mark with `data-search-occurrence="0"` ✅

4. When navigating to match 1:
   - `globalCurrentIndex = 1`
   - `currentMatch = allMatches[1]` (startIndex: 25, endIndex: 30)
   - `partMatches` contains the same 3 matches (re-filtered from allMatches)
   - `localIndex = findIndex` finds occurrence 1
   - `occurrenceIndex` in marks should be 1, but might be calculating differently
   - Tries to select mark with `data-search-occurrence="1"` ❌ Could be wrong!

### Secondary Hypothesis: Difference Between Text Nodes and Match Indices

The Markdown component:
1. Walks through text nodes in the DOM
2. Finds occurrences of the query in each text node
3. Creates marks with `data-search-occurrence` counted per text node

But when finding the current match:
1. Filters `allMatches` by messageId and partIndex
2. Sorts by startIndex and endIndex
3. Finds the index of the current match using `findIndex`

**The problem**: The `occurrenceIndex` on marks might not align with the `localIndex` calculated from the global matches!

### Tertiary Hypothesis: CSS Specificity Issue

The CSS has this structure:
```css
.search-match { }
.search-match--current { }
.markdown-content .search-match { }
.markdown-content .search-match--current { }
```

If `.markdown-content .search-match` is overriding `.search-match--current` in specificity calculations, the outline might not be applied.

**However**, CSS specificity rules suggest:
- `.search-match--current` (0,0,1,0) should override `.markdown-content .search-match` (0,0,1,1)
- And `.markdown-content .search-match--current` (0,0,2,0) should override both

So this is less likely to be the root cause.

## Debugging Setup

### 1. SearchHighlightedText Component (Plain Text)

Files Modified:
- `packages/ui/src/components/search-highlighted-text.tsx`

Debug Logs Added:
```typescript
console.log('[SearchHighlight] Debug:', {
  props: { messageId, partIndex },
  globalCurrentIndex,
  currentMatch,
  partMatchesCount: partMatches().length,
  sortedMatchesCount: sortedMatches.length,
  currentMatchOccurrenceIndex,
  sortedMatches: sortedMatches.map(m => ({
    startIndex: m.startIndex,
    endIndex: m.endIndex,
    text: m.text,
    messageId: m.messageId,
    partIndex: m.partIndex,
  })),
})

console.log('[SearchHighlight] Match result:', {
  index,
  startIndex: match.startIndex,
  endIndex: match.endIndex,
  text: match.text,
  isCurrent,
  currentMatchOccurrenceIndex,
})

console.log('[SearchHighlight] Rendering segment:', {
  type: segment.type,
  isCurrent: segment.type === "match" ? segment.isCurrent : undefined,
  occurrenceIndex: segment.type === "match" ? segment.occurrenceIndex : undefined,
  content: segment.type === "match" ? segment.content : undefined,
  className: segment.type === "match"
    ? (segment.isCurrent ? "search-match search-match--current" : "search-match")
    : undefined,
})
```

### 2. Markdown Component (Markdown Content)

Files Modified:
- `packages/ui/src/components/markdown.tsx`

Debug Logs Added:
```typescript
console.log('[Markdown applySearchHighlights] Starting:', {
  scopeMessageId,
  scopePartIndex,
  query: q,
  totalMatches: allMatches.length,
})

console.log('[Markdown applySearchHighlights] Text nodes:', nodes.length)

console.log('[Markdown applySearchHighlights] Found occurrences in text node:', occurrences.length)

console.log('[Markdown applySearchHighlights] Created mark:', {
  text: original.slice(occ.start, occ.end),
  occurrenceIndex,
})

console.log('[Markdown Search] Applying highlights:', {
  scopeMessageId,
  scopePartIndex,
  globalCurrentIndex: idx,
  totalMatches: allMatches.length,
})

console.log('[Markdown Search] Current match:', currentMatch)

console.log('[Markdown Search] Part matches:', partMatches)

console.log('[Markdown Search] Local index:', localIndex)

console.log('[Markdown Search] Selector:', selector)

console.log('[Markdown Search] Found mark:', mark)

console.log('[Markdown Search] Adding current class to mark. Current classes:', mark.className)

console.log('[Markdown Search] Classes after adding:', mark.className)

console.log('[Markdown Search] All marks in container:', Array.from(allMarks).map(m => ({
  text: m.textContent,
  classes: m.className,
  occurrence: m.getAttribute('data-search-occurrence'),
})))
```

## Testing Procedure

1. **Open the DevTools Console** in the browser

2. **Create a test scenario**:
   - Have a message with the same word appearing 3+ times
   - Example: "Hello world! Hello again world. Hello to the world."

3. **Search for the word** (e.g., "world")

4. **Navigate through matches** and observe console output:

### Expected Output when navigating to occurrence 0:
```
[Markdown Search] Applying highlights: { scopeMessageId: "msg-1", scopePartIndex: 0, globalCurrentIndex: 0, totalMatches: 3 }
[Markdown Search] Current match: { messageId: "msg-1", partIndex: 0, startIndex: 6, endIndex: 11, text: "world", isCurrent: false }
[Markdown Search] Part matches: [ { startIndex: 6, endIndex: 11, ... }, { startIndex: 25, endIndex: 30, ... }, { startIndex: 42, endIndex: 47, ... } ]
[Markdown Search] Local index: 0
[Markdown Search] Selector: mark.search-match[data-search-match="true"][data-search-message-id="msg-1"][data-search-part-index="0"][data-search-occurrence="0"]
[Markdown Search] Found mark: <mark class="search-match">...</mark>
[Markdown Search] Adding current class to mark. Current classes: search-match
[Markdown Search] Classes after adding: search-match search-match--current
[Markdown Search] All marks in container: [ { text: "world", classes: "search-match search-match--current", occurrence: "0" }, { text: "world", classes: "search-match", occurrence: "1" }, { text: "world", classes: "search-match", occurrence: "2" } ]
```

### Expected Output when navigating to occurrence 1:
```
[Markdown Search] Applying highlights: { scopeMessageId: "msg-1", scopePartIndex: 0, globalCurrentIndex: 1, totalMatches: 3 }
[Markdown Search] Current match: { messageId: "msg-1", partIndex: 0, startIndex: 25, endIndex: 30, text: "world", isCurrent: false }
[Markdown Search] Part matches: [ { startIndex: 6, endIndex: 11, ... }, { startIndex: 25, endIndex: 30, ... }, { startIndex: 42, endIndex: 47, ... } ]
[Markdown Search] Local index: 1
[Markdown Search] Selector: mark.search-match[data-search-match="true"][data-search-message-id="msg-1"][data-search-part-index="0"][data-search-occurrence="1"]
[Markdown Search] Found mark: <mark class="search-match">...</mark>
[Markdown Search] Adding current class to mark. Current classes: search-match
[Markdown Search] Classes after adding: search-match search-match--current
[Markdown Search] All marks in container: [ { text: "world", classes: "search-match", occurrence: "0" }, { text: "world", classes: "search-match search-match--current", occurrence: "1" }, { text: "world", classes: "search-match", occurrence: "2" } ]
```

### ⚠️ POSSIBLE BUG: What we might actually see:
```
[Markdown Search] Applying highlights: { scopeMessageId: "msg-1", scopePartIndex: 0, globalCurrentIndex: 1, totalMatches: 3 }
[Markdown Search] Current match: { messageId: "msg-1", partIndex: 0, startIndex: 25, endIndex: 30, text: "world", isCurrent: false }
[Markdown Search] Part matches: [ { startIndex: 6, endIndex: 11, ... }, { startIndex: 25, endIndex: 30, ... }, { startIndex: 42, endIndex: 47, ... } ]
[Markdown Search] Local index: 1
[Markdown Search] Selector: mark.search-match[data-search-match="true"][data-search-message-id="msg-1"][data-search-part-index="0"][data-search-occurrence="1"]
[Markdown Search] Found mark: <mark class="search-match">...</mark>
[Markdown Search] Adding current class to mark. Current classes: search-match
[Markdown Search] Classes after adding: search-match search-match--current
[Markdown Search] All marks in container: [ { text: "world", classes: "search-match search-match--current", occurrence: "0" }, { text: "world", classes: "search-match", occurrence: "1" }, { text: "world", classes: "search-match", occurrence: "2" } ]
```

Wait, that looks correct too. Let me think...

**Actually, the bug might be that `occurrenceIndex` is not being reset properly between calls to `applySearchHighlights`!**

If the function is called multiple times (e.g., when `searchMatches()` or `searchCurrentIndex()` changes), it:
1. First calls `clearSearchMarks()`
2. Then creates new marks with a fresh `occurrenceIndex = 0`

But if something about the reactivity timing is wrong, maybe the marks created in one call are being used with the `occurrenceIndex` from a previous call?

OR:

The `occurrenceIndex` counter is incremented per text node, but if the DOM tree walker finds matches in a different order than the global matches are sorted, the indices won't align!

## Key Investigation Points

1. **Check if `occurrenceIndex` matches `localIndex`**:
   - In console, compare the `data-search-occurrence` values on marks with the `localIndex` being searched for
   - If they don't match, that's the bug!

2. **Check sorting order**:
   - Compare `sortedMatches` order with the order marks are created in the DOM tree walker
   - Are they the same?

3. **Check if multiple calls to `applySearchHighlights` are happening**:
   - Do you see `[Markdown applySearchHighlights] Starting` logs multiple times per navigation?
   - That could indicate a reactivity issue

4. **Check if previous marks are being cleared**:
   - After `clearSearchMarks()`, do you still see old marks in the DOM?

5. **Verify CSS classes**:
   - Use the DevTools Elements panel to inspect the `<mark>` elements
   - Check if they actually have `search-match--current` class
   - Check if the outline is being applied via CSS
   - Check if any other CSS is overriding the outline

## Most Likely Bug

Based on the code analysis, the most likely bug is:

**The `occurrenceIndex` counter in `applySearchHighlights` increments per text node, but the `localIndex` is calculated from the global matches sorted by position. If the DOM tree walker visits text nodes in a different order than the matches are sorted, the indices will not align!**

Example scenario:
- Text: "A world B world"
- DOM tree walker might find:
  - Text node 1: "A world " → finds "world" at position 2 → `occurrenceIndex = 0`
  - Text node 2: "B world" → finds "world" at position 2 → `occurrenceIndex = 1` (relative to text node 2)

But if there are spans or other elements in between:
- Text: "<span>A</span> world <span>B</span> world"
- DOM tree walker:
  - Text node 1: "A" → no match
  - Text node 2: " world " → finds "world" at position 1 → `occurrenceIndex = 0`
  - Text node 3: "B" → no match
  - Text node 4: " world" → finds "world" at position 1 → `occurrenceIndex = 0` again!! 🐛

**Wait, no... Looking at the code again:**

```typescript
let occurrenceIndex = 0

for (const textNode of nodes) {
  // ... find occurrences ...
  for (const occ of occurrences) {
    // ... create mark ...
    if (scopeMessageId && scopePartIndex !== null) {
      mark.setAttribute("data-search-occurrence", String(occurrenceIndex))
      occurrenceIndex += 1
    }
    // ...
  }
}
```

The `occurrenceIndex` is incremented **outside** the text node loop, so it should be unique across all marks.

Hmm, but if `clearSearchMarks()` is called and the function runs again, the `occurrenceIndex` starts from 0 again. That should be correct.

**Wait, I see it now!**

The `occurrenceIndex` is only incremented **if** `scopeMessageId && scopePartIndex !== null`. But what if the `props.messageId` or `props.partIndex` are not set in some case? Or are undefined?

Actually, looking at the Markdown component creation, it seems like they should always be set.

**Let me check another possibility:**

Maybe the issue is that when `applySearchHighlights` is called, the marks are created in one order, but when the current match is selected, the `partMatches` are sorted differently?

Let me look at how matches are found:

```typescript
const partMatches = allMatches
  .filter((m) => m.messageId === scopeMessageId && m.partIndex === scopePartIndex)
  .slice()
  .sort((a, b) => a.startIndex - b.startIndex)
```

They're sorted by `startIndex`. That should match the order marks are created in (assuming the DOM tree walker visits text nodes in order).

**Actually, I think I need to see the actual console output to diagnose this properly.**

The debugging logs will show:
1. What the `occurrenceIndex` values are on the marks
2. What the `localIndex` value is
3. Whether the selector finds the correct mark

If the `occurrenceIndex` values are 0, 1, 2, 3... and the `localIndex` is trying to find 1, but the selector doesn't find anything, then there's an index mismatch.

If the selector does find a mark and adds the class, but the class isn't showing visually, then it's a CSS issue.

## Next Steps

1. Run the test scenario following the procedure above
2. Capture the console output
3. Inspect the DOM elements in DevTools
4. Identify the discrepancy

Based on the findings, the fix will likely involve:
- Ensuring the `occurrenceIndex` counter matches the sorted order of global matches
- Or changing how the current match is selected (e.g., startIndex and endIndex instead of occurrenceIndex)
- Or fixing the CSS hierarchy if that's the issue
