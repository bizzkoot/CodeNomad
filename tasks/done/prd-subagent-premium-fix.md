# Product Requirements Document: Subagent Premium Request Fix

**Document Version:** 1.0  
**Date:** February 1, 2026  
**Status:** Ready for Implementation  
**Author:** CodeNomad Development Team

---

## Executive Summary

**Problem:** Subagent sessions created via the `task` tool are incorrectly consuming premium API quota, causing users to exhaust their limits faster than expected.

**Solution:** Modify the UI's usage tracking logic to check `session.parentId` before applying usage entries, skipping tracking for subagent sessions (where `parentId !== null`).

**Impact:** Users will only consume premium quota for main agent sessions, not for delegated subagent work.

---

## Problem Statement

### Current Behavior

When a main agent delegates work to a subagent:

1. User sends a prompt to main agent → **Premium request consumed** ✅
2. Main agent calls `task` tool to create subagent
3. Subagent session is created with `parentId` pointing to main session
4. Server emits `session.updated` (with parentID) before `message.updated` ✅
5. Subagent completes work → **Premium request consumed** ❌ (BUG)
6. Main agent continues → **No additional premium consumed** ✅

**Expected:** Only step 1 should consume premium quota.

**Actual:** Steps 1 and 5 both consume premium quota.

### User Impact

- Quota exhaustion occurs ~2x faster when using subagents
- Users avoid using powerful subagent-based features to conserve quota
- Inconsistent with user expectations (similar tools like VSCode Copilot don't count internal operations)

---

## Root Cause Analysis

### Server-Side (Already Fixed)

**Commit:** `f9f7f2193016bde49e29fc00bb466b05415c3106`

The server-side fix in `packages/server/src/workspaces/instance-events.ts` ensures:
1. A session cache stores `parentID` information
2. When a `message.updated` event arrives for an uncached session
3. The server fetches session info from the OpenCode instance
4. Emits a synthetic `session.updated` event (with `parentID`) BEFORE the `message.updated`

**Status:** ✅ Working correctly

### UI-Side (Root Cause)

**File:** `packages/ui/src/stores/message-v2/instance-store.ts`

**Function:** `updateUsageWithInfo` (lines 293-304)

```typescript
function updateUsageWithInfo(info: MessageInfo | undefined) {
  if (!info || typeof info.sessionID !== "string") return
  const messageId = typeof info.id === "string" ? info.id : undefined
  if (!messageId) return
  withUsageState(info.sessionID, (draft) => {  // ❌ No subagent check
    removeUsageEntry(draft, messageId)
    const entry = extractUsageEntry(info)
    if (entry) {
      applyUsageState(draft, entry)  // ❌ Always applies usage
    }
  })
}
```

**Problem:** This function tracks usage for ALL messages without checking if the session is a subagent.

**Why the parentID info is available:**
- `SessionRecord` type has `parentId?: string | null` field
- Sessions are stored in `state.sessions[sessionId]`
- Main sessions have `parentId: null`
- Subagent sessions have `parentId: "some-parent-id"`
- The server fix ensures `parentId` is populated before messages are processed

**Secondary Problem:**
- `rebuildUsageStateFromInfos` (lines 173-182) is called during message hydration
- It also doesn't filter out subagent sessions
- This could cause usage to be tracked during initial load

---

## Proposed Solution

### Overview

Add a subagent session check before applying usage tracking. Skip usage tracking for any session where `parentId !== null`.

### Implementation Details

#### Change 1: `updateUsageWithInfo` Function

**File:** `packages/ui/src/stores/message-v2/instance-store.ts`  
**Location:** Lines 293-304

**Current Code:**
```typescript
function updateUsageWithInfo(info: MessageInfo | undefined) {
  if (!info || typeof info.sessionID !== "string") return
  const messageId = typeof info.id === "string" ? info.id : undefined
  if (!messageId) return
  withUsageState(info.sessionID, (draft) => {
    removeUsageEntry(draft, messageId)
    const entry = extractUsageEntry(info)
    if (entry) {
      applyUsageState(draft, entry)
    }
  })
}
```

**New Code:**
```typescript
function updateUsageWithInfo(info: MessageInfo | undefined) {
  if (!info || typeof info.sessionID !== "string") return
  const messageId = typeof info.id === "string" ? info.id : undefined
  if (!messageId) return
  
  // Skip usage tracking for subagent sessions
  const session = state.sessions[info.sessionID]
  if (session?.parentId != null) {
    return
  }
  
  withUsageState(info.sessionID, (draft) => {
    removeUsageEntry(draft, messageId)
    const entry = extractUsageEntry(info)
    if (entry) {
      applyUsageState(draft, entry)
    }
  })
}
```

**Logic:**
- Look up the session from `state.sessions` using `info.sessionID`
- If `session?.parentId != null`, this is a subagent session
- Return early to skip usage tracking

#### Change 2: `rebuildUsageStateFromInfos` Function

**File:** `packages/ui/src/stores/message-v2/instance-store.ts`  
**Location:** Lines 173-182

**Current Code:**
```typescript
function rebuildUsageStateFromInfos(infos: Iterable<MessageInfo>): SessionUsageState {
  const usageState = createEmptyUsageState()
  for (const info of infos) {
    const entry = extractUsageEntry(info)
    if (entry) {
      applyUsageState(usageState, entry)
    }
  }
  return usageState
}
```

**New Code:**
```typescript
function rebuildUsageStateFromInfos(
  infos: Iterable<MessageInfo>,
  sessionsMap?: Record<string, SessionRecord>
): SessionUsageState {
  const usageState = createEmptyUsageState()
  for (const info of infos) {
    // Skip subagent sessions during hydration
    if (sessionsMap && info.sessionID) {
      const session = sessionsMap[info.sessionID]
      if (session?.parentId != null) {
        continue
      }
    }
    const entry = extractUsageEntry(info)
    if (entry) {
      applyUsageState(usageState, entry)
    }
  }
  return usageState
}
```

**Note:** This function needs access to the sessions map. The calling code needs to be updated to pass `state.sessions`.

#### Change 3: Update Call Sites for `rebuildUsageStateFromInfos`

**File:** `packages/ui/src/stores/message-v2/instance-store.ts`

**Location 1:** Line 176 (within the function itself, recursive call if any)

**Location 2:** `hydrateMessages` function (around line 382)

**Current:**
```typescript
const usageState = infoList ? rebuildUsageStateFromInfos(infoList.values()) : state.usage[sessionId]
```

**New:**
```typescript
const usageState = infoList 
  ? rebuildUsageStateFromInfos(infoList.values(), state.sessions) 
  : state.usage[sessionId]
```

---

## Technical Considerations

### Data Flow

```
1. Server emits session.updated (with parentID)
2. UI stores session with parentId in state.sessions
3. Server emits message.updated
4. UI receives message info
5. updateUsageWithInfo called
6. ✅ NEW: Check state.sessions[sessionId]?.parentId
7. If subagent → skip usage tracking
8. If main session → apply usage tracking
```

### Edge Cases

1. **Session not yet in store:**
   - If `state.sessions[sessionId]` is undefined, `session?.parentId` returns undefined
   - `undefined != null` is false, so usage will be tracked (safe fallback)
   - This handles race conditions where message arrives before session info

2. **Main session with no parentId:**
   - `parentId: null` or `parentId: undefined`
   - `null != null` is false, usage tracked correctly
   - `undefined != null` is true, usage tracked correctly

3. **Subagent with parentId:**
   - `parentId: "some-id"`
   - `"some-id" != null` is true, usage skipped correctly

### Performance Impact

- **Minimal:** O(1) map lookup per message
- **No additional memory:** Uses existing session store
- **No additional network calls:** All data already in UI state

### Backward Compatibility

- ✅ Existing sessions continue to work
- ✅ Premium usage history preserved
- ✅ No database migration needed
- ✅ No API changes
- ✅ No UI changes needed

---

## Testing Strategy

### Unit Tests

**Test 1: Main session usage tracked**
```typescript
test('updateUsageWithInfo tracks usage for main session (no parentId)', () => {
  // Setup: Create session with parentId: null
  // Call updateUsageWithInfo
  // Assert: Usage entry added to state
})
```

**Test 2: Subagent session usage skipped**
```typescript
test('updateUsageWithInfo skips usage for subagent session (has parentId)', () => {
  // Setup: Create session with parentId: "parent-123"
  // Call updateUsageWithInfo
  // Assert: No usage entry added
})
```

**Test 3: Missing session defaults to tracking**
```typescript
test('updateUsageWithInfo tracks usage when session not in store', () => {
  // Setup: Call with non-existent session ID
  // Assert: Usage tracked (safe default)
})
```

### Integration Tests

**Test 1: Full subagent flow**
1. Start main agent session
2. Trigger task tool with subagent
3. Verify child session created with parentId
4. Verify main session premium usage = 1
5. Verify subagent session premium usage = 0

**Test 2: Multiple subagent tasks**
1. Send prompt requiring 3 subagent tasks
2. Verify total premium = 1 (main only)
3. Verify all subagent messages completed

**Test 3: Session hydration**
1. Close and reopen CodeNomad
2. Verify subagent usage not double-counted during hydration

### Manual Testing Checklist

- [ ] Create main session, send prompt (no subagents) → Premium = 1
- [ ] Send prompt that triggers 1 subagent → Premium = 1 (not 2)
- [ ] Send prompt that triggers multiple subagents → Premium = 1 (not N+1)
- [ ] Multi-turn conversation with subagent tasks → Premium = turn count (not more)
- [ ] Verify context usage panel shows correct premium count
- [ ] Close/reopen CodeNomad, verify usage counts preserved correctly

### Console Log Verification (Dev Mode)

After implementing the fix, you can verify it works by running `npm run dev` and checking the browser console. Add these console logs to track what's happening:

#### Add These Console Logs

**In `updateUsageWithInfo` function:**
```typescript
function updateUsageWithInfo(info: MessageInfo | undefined) {
  if (!info || typeof info.sessionID !== "string") return
  const messageId = typeof info.id === "string" ? info.id : undefined
  if (!messageId) return
  
  // Check if this is a subagent session
  const session = state.sessions[info.sessionID]
  console.log(`[Usage Debug] Session: ${info.sessionID}, parentId: ${session?.parentId}, role: ${info.role}`)
  
  if (session?.parentId != null) {
    console.log(`[Usage Debug] ⏭️ SKIPPING subagent session ${info.sessionID} - parentId: ${session.parentId}`)
    return  // Skip usage tracking for subagents
  }
  
  console.log(`[Usage Debug] ✅ TRACKING main session ${info.sessionID}`)
  
  withUsageState(info.sessionID, (draft) => {
    removeUsageEntry(draft, messageId)
    const entry = extractUsageEntry(info)
    if (entry) {
      applyUsageState(draft, entry)
    }
  })
}
```

**In `addOrUpdateSession` function (to track session creation):**
```typescript
function addOrUpdateSession(input: SessionUpsertInput) {
  const session = ensureSessionEntry(input.id)
  // ... existing code ...
  
  console.log(`[Session Debug] Session ${input.id} updated - parentId: ${input.parentId ?? 'null (main session)'}`)
}
```

#### Expected Log Output

**Scenario 1: Main Agent (Should Track Usage)**
```
[Session Debug] Session abc-123 updated - parentId: null (main session)
[Usage Debug] Session: abc-123, parentId: null, role: assistant
[Usage Debug] ✅ TRACKING main session abc-123
```

**Scenario 2: Subagent (Should Skip Usage)**
```
[Session Debug] Session xyz-789 updated - parentId: abc-123
[Usage Debug] Session: xyz-789, parentId: abc-123, role: assistant
[Usage Debug] ⏭️ SKIPPING subagent session xyz-789 - parentId: abc-123
```

**Scenario 3: Subagent with Multiple Messages**
```
[Session Debug] Session sub-456 updated - parentId: main-123
[Usage Debug] Session: sub-456, parentId: main-123, role: assistant
[Usage Debug] ⏭️ SKIPPING subagent session sub-456 - parentId: main-123
[Usage Debug] Session: sub-456, parentId: main-123, role: assistant
[Usage Debug] ⏭️ SKIPPING subagent session sub-456 - parentId: main-123
[Usage Debug] Session: sub-456, parentId: main-123, role: assistant
[Usage Debug] ⏭️ SKIPPING subagent session sub-456 - parentId: main-123
```

**Key Indicators the Fix is Working:**
- ✅ You see "⏭️ SKIPPING" for subagent sessions (parentId !== null)
- ✅ You see "✅ TRACKING" only for main sessions (parentId === null)
- ✅ Context Usage Panel shows 1 premium request (not 2, 3, etc.) when using subagents
- ✅ Premium request count increases only when main agent responds

**Red Flags (Fix Not Working):**
- ❌ No "⏭️ SKIPPING" logs when subagents run
- ❌ "✅ TRACKING" for sessions with parentId
- ❌ Context Usage Panel shows 2+ premium requests for single subagent task

#### Share Your Test Results

When testing, share these console logs:
1. Session ID and parentId of the main session
2. Session ID and parentId of subagent session(s)
3. Whether each message shows "SKIPPING" or "TRACKING"
4. Final premium request count shown in Context Usage Panel
5. Expected premium count (should be 1 per main agent turn, regardless of subagent count)

Example report format:
```
Test: Analyzed codebase with explore subagent
Main Session: ml2abc123 (parentId: null)
Subagent Session: ml2xyz789 (parentId: ml2abc123)
Logs:
  - [TRACKING] ml2abc123 - Main agent initial response
  - [SKIPPING] ml2xyz789 - Explore subagent analysis
  - [SKIPPING] ml2xyz789 - Explore subagent results
Context Usage Panel: 1/50 premium requests ✅
Expected: 1 premium ✅
Result: FIX WORKING
```

---

## Success Metrics

### Quantitative

1. **Premium consumption per session:**
   - Before: 1 + N (where N = subagent count)
   - After: 1 (regardless of subagent count)
   - Target: 100% of sessions using subagents should show reduction

2. **User quota exhaustion rate:**
   - Target: 40-50% reduction in users hitting premium limits

### Qualitative

1. User feedback about quota fairness
2. Support tickets related to unexpected quota usage
3. Feature adoption rates for subagent-heavy features

---

## Implementation Checklist

- [ ] Modify `updateUsageWithInfo` to check `session.parentId`
- [ ] Modify `rebuildUsageStateFromInfos` to accept and use sessions map
- [ ] Update all call sites to pass sessions map
- [ ] Run `npm run typecheck` - verify no TypeScript errors
- [ ] Run `npm run build:ui` - verify UI builds successfully
- [ ] Run `npm run build` - verify full build succeeds
- [ ] Write unit tests for new logic
- [ ] Test manually with subagent tasks
- [ ] Verify premium usage displays correctly in UI

---

## Related Files

**Primary Implementation:**
- `packages/ui/src/stores/message-v2/instance-store.ts`

**Related Code:**
- `packages/server/src/workspaces/instance-events.ts` (server-side fix, already implemented)
- `packages/ui/src/stores/message-v2/types.ts` (SessionRecord type definition)
- `packages/ui/src/stores/session-state.ts` (session store)

**Documentation:**
- `docs/subagent-premium-bypass-prd.md` (previous PRD for server-side fix)

---

## Approval & Sign-off

**Engineering Lead:** _________________________  
**QA Lead:** _________________________  
**Product Owner:** _________________________

**Status:** ☐ Ready for Development  ☐ In Progress  ☐ Code Review  ☐ Testing  ☐ Complete

---

**End of Document**
