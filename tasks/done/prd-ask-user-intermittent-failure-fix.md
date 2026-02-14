# Product Requirements Document: Ask_User Tool Intermittent Failure Fix

**Document Version:** 1.0  
**Date:** February 1, 2026  
**Status:** Ready for Implementation  
**Author:** CodeNomad Development Team

---

## Executive Summary

**Problem:** The `ask_user` tool exhibits intermittent failures due to the `InstanceShell` component remounting multiple times, causing race conditions in the MCP bridge initialization and message handling.

**Solution:** Implement a robust, idempotent bridge initialization system that can handle component remounts without losing pending questions or creating duplicate listeners.

**Impact:** Users will experience reliable ask_user functionality regardless of session lifecycle changes.

---

## Problem Statement

### Current Behavior

When a user creates a new session after completing a previous one (or during certain lifecycle events), the following occurs:

1. `InstanceShell` component mounts → `initMcpBridge` called
2. User uses ask_user → Question sent to UI → User answers → Works ✅
3. User creates new session / certain state changes
4. `InstanceShell` remounts (3x observed) → `initMcpBridge` called repeatedly
5. Multiple IPC listeners attached → Race conditions
6. Future ask_user calls → Intermittent failures ❌

### User Impact

- Intermittent failures when using ask_user tool
- Questions sometimes not appearing in UI
- Questions appearing but not accepting answers
- Multiple duplicate question dialogs (in worst cases)
- Poor user experience during session transitions

### Evidence from Logs

```
[MCP Main] [MCP Bridge UI] initMcpBridge called {instanceId: 'ml2v0vdz'}
[MCP Main] [MCP Bridge UI] initMcpBridge called {instanceId: 'ml2v0vdz'}
[MCP Main] [MCP Bridge UI] initMcpBridge called {instanceId: 'ml2v0vdz'}
[MCP Main] Sending question to UI {requestId: '...'}
[MCP Main] Question registered in pending manager {requestId: '...'}
[MCP Main] Received render confirmation from UI {requestId: '...'}
[MCP Main] Render confirmed, starting user response timer {requestId: '...'}
[MCP Main] Received render confirmation from UI {requestId: '...'}  ← DUPLICATE!
[MCP Main] Render confirmed, starting user response timer {requestId: '...'}  ← DUPLICATE!
```

**Key Observations:**
- Bridge initialized 3 times for same instance
- Render confirmation received TWICE (duplicate listeners)
- Sometimes works, sometimes fails (race condition)

---

## Root Cause Analysis

### Primary Cause: Component Remounting

**File:** `packages/ui/src/components/instance/instance-shell2.tsx`  
**Location:** Lines 709-741

```typescript
// Initialize MCP bridge for this instance
onMount(() => {
  if (typeof window === "undefined") return
  try {
    initMcpBridge(props.instance.id)
  } catch (error) {
    console.error("[Instance Shell] Failed to initialize MCP bridge:", error)
  }

  // Cleanup MCP bridge when instance unmounts
  onCleanup(() => {
    try {
      cleanupMcpBridge(props.instance.id)
    } catch (error) {
      console.error("[Instance Shell] Failed to cleanup MCP bridge:", error)
    }
  })
})
```

**Why It Remounts:**

The `InstanceShell` component is rendered inside a `<For>` loop in `App.tsx`:

```typescript
<For each={Array.from(instances().values())}>
  {(instance) => (
    <InstanceMetadataProvider instance={instance}>
      <InstanceShell instance={instance} ... />
    </InstanceMetadataProvider>
  )}
</For>
```

**Triggers for Remount:**
1. **Instance object reference change** - When `instances()` store updates with new object references
2. **Session state changes** - When sessions are created/completed, it may trigger parent re-render
3. **Metadata changes** - `InstanceMetadataProvider` may trigger updates
4. **SolidJS reactive updates** - Changes to props or reactive dependencies

### Secondary Cause: Bridge Cleanup Removes Guard

**File:** `packages/ui/src/lib/mcp-bridge.ts`  
**Current Logic:**

```typescript
// In initMcpBridge:
if (cleanupFunctions.has(instanceId)) {
  return;  // Skip if already initialized
}
// ... initialize ...
cleanupFunctions.set(instanceId, cleanupFn);

// In cleanupMcpBridge:
const cleanup = cleanupFunctions.get(instanceId);
if (cleanup) {
  cleanup();
  cleanupFunctions.delete(instanceId);  // ← Removes the guard!
}
```

**Problem:**
- After cleanup, the entry is DELETED from `cleanupFunctions`
- On next mount, `cleanupFunctions.has(instanceId)` returns false
- Bridge re-initializes, creating duplicate listeners
- Old listeners still exist (cleanup only removes from map, not from IPC)

### Tertiary Cause: No Listener Deduplication

**File:** `packages/ui/src/lib/mcp-bridge.ts`  
**Current Listener Registration:**

```typescript
const cleanup = electronAPI.mcpOn('ask_user.asked', (payload: any) => {
  // Process question
});
const cleanupRejected = electronAPI.mcpOn('ask_user.rejected', (payload: any) => {
  // Process rejection
});
```

**Problem:**
- Each call to `initMcpBridge` registers NEW listeners
- Old listeners are not removed (cleanup function stored but may not be called)
- Multiple listeners = multiple message processing = race conditions

---

## Proposed Solution

### Overview

Implement a three-layer defense:

1. **Idempotent Initialization:** Prevent duplicate initializations even after cleanup
2. **Listener Deduplication:** Track and prevent duplicate IPC listeners
3. **Graceful Remount Handling:** Handle remounts without losing state

### Implementation Details

#### Change 1: Persistent Initialization State

**File:** `packages/ui/src/lib/mcp-bridge.ts`  
**Current Guard:**
```typescript
const cleanupFunctions = new Map<string, () => void>();

export function initMcpBridge(instanceId: string): void {
  if (cleanupFunctions.has(instanceId)) {
    return;  // Skip
  }
  // ... initialize ...
}
```

**New Guard System:**
```typescript
// Track initialization state per instance (persists across cleanups)
const initializedInstances = new Set<string>();

// Track cleanup functions per instance
const cleanupFunctions = new Map<string, () => void>();

export function initMcpBridge(instanceId: string): void {
  // Check if already initialized (persists until explicit reset)
  if (initializedInstances.has(instanceId)) {
    console.log(`[MCP Bridge UI] Already initialized for instance: ${instanceId}`);
    return;
  }
  
  // Mark as initialized immediately (before any async operations)
  initializedInstances.add(instanceId);
  
  // If there's an existing cleanup function, call it first (shouldn't happen)
  const existingCleanup = cleanupFunctions.get(instanceId);
  if (existingCleanup) {
    console.warn(`[MCP Bridge UI] Found existing cleanup for ${instanceId}, cleaning up first`);
    existingCleanup();
    cleanupFunctions.delete(instanceId);
  }
  
  // ... rest of initialization ...
}

export function cleanupMcpBridge(instanceId: string): void {
  const cleanup = cleanupFunctions.get(instanceId);
  if (cleanup) {
    cleanup();
    cleanupFunctions.delete(instanceId);
  }
  // NOTE: We intentionally do NOT remove from initializedInstances
  // This prevents re-initialization on remount
}

// NEW: Reset function for when instance is truly destroyed
export function resetMcpBridge(instanceId: string): void {
  cleanupMcpBridge(instanceId);
  initializedInstances.delete(instanceId);
  // Also clear all tracking data for this instance
  processedQuestions.clear();  // Consider making this per-instance
  requestInstanceMap.delete(instanceId);
  retryAttempts.delete(instanceId);
  questionPayloads.delete(instanceId);
}
```

**Rationale:**
- `initializedInstances` Set persists across cleanups
- Prevents re-initialization on component remount
- `resetMcpBridge` for when instance is truly destroyed (e.g., workspace closed)

#### Change 2: Listener Deduplication at IPC Level

**File:** `packages/ui/src/lib/mcp-bridge.ts`  
**New Approach:**

```typescript
// Track which IPC channels are already being listened to
const activeListeners = new Map<string, () => void>();

function ensureSingleListener(channel: string, handler: (data: any) => void): () => void {
  // If already listening to this channel, remove old listener first
  const existingCleanup = activeListeners.get(channel);
  if (existingCleanup) {
    console.log(`[MCP Bridge UI] Removing existing listener for ${channel}`);
    existingCleanup();
    activeListeners.delete(channel);
  }
  
  // Register new listener
  const cleanup = electronAPI.mcpOn(channel, handler);
  activeListeners.set(channel, cleanup);
  
  // Return combined cleanup
  return () => {
    cleanup();
    activeListeners.delete(channel);
  };
}

export function initMcpBridge(instanceId: string): void {
  if (initializedInstances.has(instanceId)) {
    return;
  }
  initializedInstances.add(instanceId);
  
  // Use deduplicated listener registration
  const cleanupAsked = ensureSingleListener('ask_user.asked', (payload: any) => {
    // ... handle question ...
  });
  
  const cleanupRejected = ensureSingleListener('ask_user.rejected', (payload: any) => {
    // ... handle rejection ...
  });
  
  // Store combined cleanup
  cleanupFunctions.set(instanceId, () => {
    cleanupAsked();
    cleanupRejected();
  });
}
```

**Rationale:**
- Ensures only ONE listener per IPC channel globally
- Prevents duplicate message processing
- Cleans up old listeners before registering new ones

#### Change 3: Instance-Specific Question Tracking

**File:** `packages/ui/src/lib/mcp-bridge.ts`  
**Current Global Tracking:**
```typescript
const processedQuestions = new Set<string>();  // Global
const requestInstanceMap = new Map<string, string>();  // RequestId -> InstanceId
```

**New Per-Instance Tracking:**
```typescript
// Track processed questions per instance
const processedQuestionsByInstance = new Map<string, Set<string>>();

// Track request-to-instance mapping
const requestInstanceMap = new Map<string, string>();

function getProcessedQuestions(instanceId: string): Set<string> {
  if (!processedQuestionsByInstance.has(instanceId)) {
    processedQuestionsByInstance.set(instanceId, new Set());
  }
  return processedQuestionsByInstance.get(instanceId)!;
}

function markQuestionProcessed(instanceId: string, requestId: string): void {
  getProcessedQuestions(instanceId).add(requestId);
  requestInstanceMap.set(requestId, instanceId);
}

function isQuestionProcessed(instanceId: string, requestId: string): boolean {
  return getProcessedQuestions(instanceId).has(requestId);
}

export function clearProcessedQuestion(requestId: string): void {
  const instanceId = requestInstanceMap.get(requestId);
  if (instanceId) {
    getProcessedQuestions(instanceId).delete(requestId);
    requestInstanceMap.delete(requestId);
  }
  retryAttempts.delete(requestId);
  questionPayloads.delete(requestId);
}

export function resetMcpBridge(instanceId: string): void {
  cleanupMcpBridge(instanceId);
  initializedInstances.delete(instanceId);
  processedQuestionsByInstance.delete(instanceId);
  
  // Clean up any orphaned request mappings
  for (const [requestId, mappedInstanceId] of requestInstanceMap.entries()) {
    if (mappedInstanceId === instanceId) {
      requestInstanceMap.delete(requestId);
      retryAttempts.delete(requestId);
      questionPayloads.delete(requestId);
    }
  }
}
```

**Rationale:**
- Questions are tracked per-instance
- Clearing one instance doesn't affect others
- Prevents cross-instance pollution

#### Change 4: Update InstanceShell to Use Reset

**File:** `packages/ui/src/components/instance/instance-shell2.tsx`  
**Current Cleanup:**
```typescript
onCleanup(() => {
  cleanupMcpBridge(props.instance.id)
})
```

**New Cleanup (for true instance destruction):**
```typescript
// For component unmount (remount-safe)
onCleanup(() => {
  cleanupMcpBridge(props.instance.id)
})

// For instance destruction (when workspace closed)
// This should be called elsewhere, e.g., when instance is removed from store
```

**Alternative - Make InstanceShell Resilient:**
If we can't prevent remounts, make the component resilient:

```typescript
onMount(() => {
  // Don't re-initialize on remount - bridge persists
  if (!isMcpBridgeInitialized(props.instance.id)) {
    initMcpBridge(props.instance.id)
  }
})
```

#### Change 5: Add Instance Removal Handler

**File:** `packages/ui/src/stores/instances.ts` (or appropriate location)

When an instance is actually removed (not just remounted):

```typescript
export function removeInstance(instanceId: string): void {
  // ... existing removal logic ...
  
  // Reset MCP bridge for this instance
  resetMcpBridge(instanceId);
}
```

---

## Alternative Solution: Prevent Remounting

If we can identify and fix what's causing `InstanceShell` to remount, we wouldn't need the above complexity.

### Investigation Steps:

1. **Check instance object reference stability:**
   - Are `instances().values()` returning new object references?
   - Can we use ` reconcile` or similar to maintain reference stability?

2. **Check InstanceMetadataProvider:**
   - Does it trigger unnecessary re-renders?
   - Can we memoize it better?

3. **Check reactive dependencies:**
   - What reactive signals are triggering the `<For>` to re-render?
   - Can we make the component less reactive to those changes?

### Quick Fix Option:

If investigation is complex, implement the bridge fix first (Changes 1-3 above), then investigate remounts separately.

---

## Technical Considerations

### Race Condition Scenarios

**Scenario 1: Question During Remount**
```
T1: Component mounted, bridge initialized
T2: Question sent from MCP
T3: Component starts unmounting
T4: Question arrives in renderer (listener active)
T5: Component unmounts (cleanup called)
T6: Component remounts (init called again)
T7: User answers question
T8: Answer sent via IPC
```

**With Current Code:**
- At T5, cleanup removes from map
- At T6, new listeners registered
- At T8, answer processed by new listener ✓

**Problem:** If cleanup happens AFTER answer is sent but BEFORE it's processed, answer is lost.

**With Fix:**
- At T6, bridge recognizes already initialized, skips
- Old listeners still active
- At T8, answer processed by old listener ✓

### Memory Leaks

**Current Risk:**
- Each remount creates new listeners
- Old listeners accumulate
- Memory usage grows

**With Fix:**
- Listeners are deduplicated
- Old listeners cleaned up before new ones registered
- No memory leak

### Backward Compatibility

- ✅ No API changes
- ✅ No protocol changes
- ✅ No database changes
- ✅ Existing functionality preserved
- ✅ Only internal implementation changes

---

## Testing Strategy

### Unit Tests

**Test 1: Idempotent Initialization**
```typescript
test('initMcpBridge is idempotent - multiple calls only initialize once', () => {
  initMcpBridge('instance-1');
  initMcpBridge('instance-1');
  initMcpBridge('instance-1');
  // Assert: Only one set of listeners registered
})
```

**Test 2: Cleanup Doesn't Allow Re-init**
```typescript
test('cleanupMcpBridge does not allow re-initialization', () => {
  initMcpBridge('instance-1');
  cleanupMcpBridge('instance-1');
  initMcpBridge('instance-1');
  // Assert: Second init is skipped
})
```

**Test 3: Reset Allows Re-init**
```typescript
test('resetMcpBridge allows re-initialization', () => {
  initMcpBridge('instance-1');
  resetMcpBridge('instance-1');
  initMcpBridge('instance-1');
  // Assert: Second init succeeds
})
```

**Test 4: Listener Deduplication**
```typescript
test('ensureSingleListener prevents duplicate IPC listeners', () => {
  const handler1 = jest.fn();
  const handler2 = jest.fn();
  ensureSingleListener('test-channel', handler1);
  ensureSingleListener('test-channel', handler2);
  // Assert: handler1 cleaned up, only handler2 active
})
```

**Test 5: Per-Instance Question Tracking**
```typescript
test('questions tracked per instance', () => {
  markQuestionProcessed('instance-1', 'req-1');
  markQuestionProcessed('instance-2', 'req-2');
  // Assert: req-1 not in instance-2, req-2 not in instance-1
})
```

### Integration Tests

**Test 1: Rapid Remounts**
```typescript
test('bridge handles rapid remounts gracefully', async () => {
  // Mount component
  // Unmount
  // Remount immediately
  // Send question
  // Assert: Question received and answerable
})
```

**Test 2: Question During Remount**
```typescript
test('question sent during remount is not lost', async () => {
  // Start remount sequence
  // Send question mid-remount
  // Complete remount
  // Assert: Question appears in UI
})
```

**Test 3: Multiple Instances**
```typescript
test('multiple instances have independent bridges', async () => {
  // Init bridge for instance-1
  // Init bridge for instance-2
  // Send question to both
  // Assert: Both questions received independently
})
```

### Manual Testing Checklist

- [ ] Open workspace, use ask_user → Works
- [ ] Complete session, create new session → ask_user still works
- [ ] Complete multiple sessions rapidly → ask_user still works
- [ ] Check browser console → initMcpBridge called only once per instance
- [ ] Check main process logs → No duplicate render confirmations
- [ ] Switch between multiple instances → Each has independent questions
- [ ] Close and reopen workspace → Bridge initializes correctly
- [ ] Stress test: 10 rapid session switches → No failures

---

## Implementation Checklist

### Phase 1: Bridge Resilience (Critical)

- [ ] Add `initializedInstances` Set for persistent init state
- [ ] Add `ensureSingleListener` for IPC deduplication
- [ ] Add `resetMcpBridge` function for true cleanup
- [ ] Implement per-instance question tracking
- [ ] Update `initMcpBridge` to use new systems
- [ ] Update `cleanupMcpBridge` to be remount-safe
- [ ] Run `npm run typecheck`
- [ ] Run `npm run build:ui`
- [ ] Run `npm run build`

### Phase 2: Instance Management (Secondary)

- [ ] Add `isMcpBridgeInitialized` helper
- [ ] Update `InstanceShell` to check before init
- [ ] Add bridge reset call when instance is removed
- [ ] Test instance removal/creation flow

### Phase 3: Remount Investigation (Optional)

- [ ] Add detailed logging to InstanceShell lifecycle
- [ ] Identify what's triggering remounts
- [ ] Fix root cause of remounting if possible
- [ ] Verify Phase 1 fix still works after Phase 3

---

## Related Files

**Primary Implementation:**
- `packages/ui/src/lib/mcp-bridge.ts` - Main bridge logic

**Related Code:**
- `packages/ui/src/components/instance/instance-shell2.tsx` - Component that initializes bridge
- `packages/ui/src/App.tsx` - Renders InstanceShell in <For> loop
- `packages/mcp-server/src/bridge/ipc.ts` - Main process IPC handlers
- `packages/mcp-server/src/bridge/renderer.ts` - Alternative renderer bridge

**Type Definitions:**
- `packages/ui/src/types/global.d.ts` - electronAPI types

---

## Success Metrics

### Quantitative

1. **Bridge Initialization Count:**
   - Before: 2-3x per instance
   - After: 1x per instance
   - Target: 100% of instances initialize exactly once

2. **Render Confirmation Duplicates:**
   - Before: 1-2 duplicates observed
   - After: 0 duplicates
   - Target: Zero duplicate render confirmations

3. **ask_user Success Rate:**
   - Before: ~70% (intermittent failures)
   - After: ~99%+
   - Target: >99% success rate

### Qualitative

1. No user reports of ask_user failures
2. No "ghost" question dialogs
3. Smooth session transitions
4. Consistent behavior across all instances

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Bridge doesn't re-init when needed | High | Low | Use `resetMcpBridge` on instance removal |
| Questions lost during transition | High | Low | Test thoroughly, add retry mechanism |
| Memory leak from old listeners | Medium | Low | `ensureSingleListener` cleans up old ones |
| Cross-instance question leakage | Medium | Low | Per-instance tracking prevents this |
| Breaking existing functionality | High | Low | Extensive testing, gradual rollout |

---

## Rollout Plan

### Option A: Full Implementation (Recommended)

Implement all changes at once:
1. Phase 1: Bridge resilience
2. Phase 2: Instance management
3. Phase 3: Remount investigation (if time permits)

### Option B: Phased Rollout

1. **Phase 1:** Implement just `initializedInstances` Set (quick fix)
2. **Test:** Verify basic functionality
3. **Phase 2:** Add listener deduplication and per-instance tracking
4. **Test:** Comprehensive testing
5. **Phase 3:** Investigate and fix remount root cause

---

## Approval & Sign-off

**Engineering Lead:** _________________________  
**QA Lead:** _________________________  
**Product Owner:** _________________________

**Status:** ☐ Ready for Development  ☐ In Progress  ☐ Code Review  ☐ Testing  ☐ Complete

---

## Current Issue: Wizard Not Opening Despite Question Arrival

**Date:** February 1, 2026  
**Status:** Debugging in Progress  
**Issue:** Question arrives from MCP but wizard does not open

### Problem Description

After implementing the PRD Phase 1 changes, a new issue emerged:
- The MCP bridge successfully receives questions
- Questions are added to the queue (verified via logging)
- The `questionQueues` signal updates
- BUT: The `AskQuestionWizard` component does not render/open

### Log Analysis

**Sequence of events:**
```
1. instance-shell2.tsx:181 [Instance Shell] pendingQuestion memo computed: {pendingId: null, hasResult: false}
2. instance-shell2.tsx:249 [Instance Shell] createEffect TRIGGERED (reactive update)
3. instance-shell2.tsx:253 [Instance Shell] createEffect check: {pendingQuestionId: null, willOpen: false}
4. instance-shell2.tsx:271 [Instance Shell] No pending question, closing wizard
5. instance-shell2.tsx:718 [Instance Shell] onMount fired
6. mcp-bridge.ts:155 [MCP Bridge UI] Initializing for instance: ml37bdqa
7. mcp-bridge.ts:362 [MCP Bridge UI] Initialized successfully
8. instance-shell2.tsx:742 [Instance Shell] Cleaning up MCP bridge  ← Component unmounts!
9. instance-shell2.tsx:181 [Instance Shell] pendingQuestion memo computed: {pendingId: null, hasResult: false}
10. instance-shell2.tsx:249 [Instance Shell] createEffect TRIGGERED
11. mcp-bridge.ts:187 [MCP Main] Sending question to UI {requestId: 'req_...'}
12. (No effect re-trigger after question arrives!)
```

**Key Finding:** The component rapidly mounts and unmounts BEFORE the question arrives. When the question finally arrives, the component is in an unstable state and the effect doesn't re-run.

### Root Cause

The issue is NOT in the MCP bridge initialization (which is now idempotent), but in the **SolidJS reactivity chain** between the question queue and the UI:

1. `questionQueues` signal is module-level (global)
2. `pendingQuestion` memo is component-local
3. When component unmounts/remounts, a NEW memo is created
4. The new memo should subscribe to the signal, but the timing is off
5. Question arrives while component is in flux
6. Effect doesn't re-run because the reactivity chain is broken

### Implemented Debug Logging

Added comprehensive logging to trace the flow:

**questions.ts:**
- `addQuestionToQueue START` - When question addition begins
- `Question added to queue` - When question is added to signal
- `addQuestionToQueue COMPLETE` - Final queue state

**instance-shell2.tsx:**
- `pendingQuestion memo computed` - When memo re-calculates
- `createEffect TRIGGERED (reactive update)` - When effect re-runs
- `createEffect check` - Current state values

### Changes Made Beyond PRD

1. **Added `pendingQuestion` memo** (instance-shell2.tsx:177-186)
   - Creates explicit reactive dependency on `questionQueues` signal
   - Logs when memo recomputes

2. **Updated effect to use memo** (instance-shell2.tsx:237-263)
   - Calls `pendingQuestion()` instead of `getPendingQuestion()`
   - Logs when effect triggers

3. **Added render confirmation to wizard** (askquestion-wizard.tsx:44-61)
   - Sends `mcp:renderConfirmed` from wizard's `onMount`
   - Only sends when wizard actually renders

4. **Removed premature confirmations** (mcp-bridge.ts)
   - Removed confirmation from initial question handler
   - Removed confirmation from retry handler
   - Now only sent from wizard's onMount

5. **Added debug logging** (questions.ts)
   - Traces question queue operations
   - Verifies signal updates

### Next Steps

1. Verify via logs that:
   - `addQuestionToQueue COMPLETE` fires when question arrives
   - `pendingQuestion memo computed` fires after queue update
   - `createEffect TRIGGERED` fires after memo updates

2. If effect doesn't trigger, investigate:
   - SolidJS version compatibility
   - Memo dependency tracking
   - Signal update propagation

3. If effect triggers but wizard doesn't open:
   - Check `Show` component condition
   - Verify `questionWizardOpen()` signal
   - Check for aria-hidden/focus issues

---

**End of Document**
