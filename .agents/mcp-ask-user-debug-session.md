# MCP ask_user Tool Debug Session
**Date**: 2026-01-19  
**Status**: READY FOR INVESTIGATION  
**Priority**: HIGH (Intermittent timeouts causing subagent failures)

## 🐛 BUG SUMMARY

### Primary Issues
1. **Intermittent Timeouts**: `ask_user` tool from subagents sometimes succeeds, sometimes times out
2. **Counter Accumulation**: Question counter increments but doesn't clear after question is answered
3. **Duplicate Event Handling**: Each question is received 3x by the MCP bridge

### Impact
- Subagents fail when ask_user times out
- User confusion from increasing counter that never resets
- Race conditions from duplicate question handling

---

## 📊 EVIDENCE & SYMPTOMS

### Console Log Pattern (2026-01-19)
```
instance-shell2.tsx:202 [Instance Shell] onMount fired for instance: mkkd2vy8
mcp-bridge.ts:24 [MCP Bridge UI] Initializing MCP bridge for instance: mkkd2vy8

↓ **REPEATED 3 TIMES** ↓

instance-shell2.tsx:202 [Instance Shell] onMount fired for instance: mkkd2vy8
mcp-bridge.ts:24 [MCP Bridge UI] Initializing MCP bridge for instance: mkkd2vy8

instance-shell2.tsx:202 [Instance Shell] onMount fired for instance: mkkd2vy8
mcp-bridge.ts:24 [MCP Bridge UI] Initializing MCP bridge for instance: mkkd2vy8
```

### Question Handling Pattern
```
mcp-bridge.ts:76 [MCP Bridge UI] Received question: {requestId: 'req_1768779214029_atnlu1qq6', questions: Array(1), ...}
mcp-bridge.ts:76 [MCP Bridge UI] Received question: {requestId: 'req_1768779214029_atnlu1qq6', questions: Array(1), ...}
mcp-bridge.ts:76 [MCP Bridge UI] Received question: {requestId: 'req_1768779214029_atnlu1qq6', questions: Array(1), ...}

askquestion-wizard.tsx:83 [Question Wizard] Opening wizard for question: req_1768779214029_atnlu1qq6
askquestion-wizard.tsx:88 [Question Wizard] Wizard opened successfully

mcp-bridge.ts:76 [MCP Bridge UI] Received question: {requestId: 'req_1768779214029_atnlu1qq6', questions: Array(1), ...}
askquestion-wizard.tsx:83 [Question Wizard] Opening wizard for question: req_1768779214029_atnlu1qq6
askquestion-wizard.tsx:88 [Question Wizard] Wizard opened successfully
```
↳ **Same requestId received and processed 3 times**

### Successful Operations (When They Work)
```
mcp-bridge.ts:112 [MCP Bridge UI] Sending answer for req_1768779214029_atnlu1qq6
mcp-bridge.ts:117 [MCP Bridge UI] Answer sent successfully

mcp-bridge.ts:130 [MCP Bridge UI] Sending cancel for req_1768779214029_atnlu1qq6: user_cancelled
mcp-bridge.ts:135 [MCP Bridge UI] Cancel sent successfully
```
↳ **IPC communication works when triggered**

### Counter Behavior
```
// Counter increments when questions arrive (3x per question)
// Counter DOES NOT decrement when:
// - Answer is sent successfully
// - Question is cancelled
// Result: Counter shows accumulated count instead of pending count
```

---

## 🔍 ROOT CAUSE HYPOTHESIS

### Primary Suspect: Multiple Component Initialization
**File**: `packages/ui/src/components/instance-shell2.tsx`

**Issue**: `onMount` lifecycle hook fires **3 times** for the same instance
- Each onMount calls `initializeMCPBridge()`
- Each initialization registers IPC event listeners
- Result: **3 listeners registered for same event channel**

**Why this happens**:
1. Solid.js reactive system may be re-running the component
2. Missing or incorrect `onCleanup` to remove old listeners
3. Component mounting/unmounting/remounting pattern
4. StrictMode or dev-mode double-rendering (unlikely in Electron)

### Secondary Suspect: IPC Event Handler Accumulation
**File**: `packages/ui/src/lib/mcp-bridge.ts`

**Issue**: Event listeners not properly cleaned up
```typescript
// Current pattern (suspected):
window.electron.ipcRenderer.on('mcp:askQuestion', (event, data) => {
  // Handler registered 3x, fires 3x per event
});

// Missing cleanup:
onCleanup(() => {
  window.electron.ipcRenderer.removeListener('mcp:askQuestion', handler);
});
```

### Tertiary Suspect: Question Store Counter Logic
**File**: `packages/ui/src/stores/questions.ts`

**Issue**: Counter increment/decrement mismatch
- `addPendingQuestion()` increments counter
- `removePendingQuestion()` should decrement counter
- Possible issues:
  - removePendingQuestion not called after answer/cancel
  - Called with wrong requestId (doesn't match)
  - Race condition from 3x duplicate questions

---

## 🎯 INVESTIGATION PLAN

### Phase 1: Identify Initialization Redundancy
```markdown
- [ ] Read instance-shell2.tsx onMount implementation
- [ ] Check if onCleanup exists for MCP bridge
- [ ] Verify MCP bridge initialization is idempotent
- [ ] Add guards to prevent multiple initializations
- [ ] Check parent component re-render patterns
```

### Phase 2: Audit IPC Event Listeners
```markdown
- [ ] Read mcp-bridge.ts initializeMCPBridge function
- [ ] Identify all ipcRenderer.on() registrations
- [ ] Check if removeListener is called anywhere
- [ ] Verify listener references stored for cleanup
- [ ] Add listener deduplication logic
```

### Phase 3: Trace Question Lifecycle
```markdown
- [ ] Read questions.ts store implementation
- [ ] Trace addPendingQuestion call sites
- [ ] Trace removePendingQuestion call sites
- [ ] Verify counter increment/decrement logic
- [ ] Check if duplicate requestIds handled
```

### Phase 4: Fix Implementation
```markdown
- [ ] Add initialization guard in instance-shell2
- [ ] Implement proper onCleanup for IPC listeners
- [ ] Add requestId deduplication in question handler
- [ ] Ensure removePendingQuestion called after answer/cancel
- [ ] Add defensive checks for duplicate questions
```

### Phase 5: Validation
```markdown
- [ ] Test: Single question should log "Received question" once
- [ ] Test: Counter should increment by 1 per question
- [ ] Test: Counter should decrement to 0 after answer
- [ ] Test: Multiple subagents shouldn't cause accumulation
- [ ] Test: No timeout errors for 10+ consecutive ask_user calls
```

---

## 📂 KEY FILES TO INVESTIGATE

### 1. Instance Shell (Component Lifecycle)
**Path**: `packages/ui/src/components/instance-shell2.tsx`
**Lines of Interest**: 
- onMount implementation (~line 202)
- MCP bridge initialization call
- onCleanup implementation (if exists)

**Questions**:
- Why does onMount fire 3 times?
- Is there an onCleanup to remove event listeners?
- Are there multiple instances of the same component?

### 2. MCP Bridge (IPC Communication)
**Path**: `packages/ui/src/lib/mcp-bridge.ts`
**Lines of Interest**:
- `initializeMCPBridge()` function (~line 24)
- `ipcRenderer.on('mcp:askQuestion')` handler (~line 76)
- `sendAnswer()` function (~line 112)
- `sendCancel()` function (~line 130)

**Questions**:
- Are listeners properly removed on cleanup?
- Is there guard against multiple initializations?
- How is requestId validated?

### 3. Question Store (State Management)
**Path**: `packages/ui/src/stores/questions.ts`
**Lines of Interest**:
- `addPendingQuestion()` implementation
- `removePendingQuestion()` implementation
- Counter increment/decrement logic
- Duplicate requestId handling

**Questions**:
- Is removePendingQuestion called after answer?
- Does counter logic match question lifecycle?
- Are duplicate requestIds filtered?

### 4. Question Wizard (UI Component)
**Path**: `packages/ui/src/components/askquestion-wizard.tsx`
**Lines of Interest**:
- `handleSubmit()` implementation (~line 83)
- `handleCancel()` implementation
- Calls to removePendingQuestion
- Dialog open/close lifecycle

**Questions**:
- Does wizard call removePendingQuestion on submit?
- Does wizard call removePendingQuestion on cancel?
- Can multiple wizards open for same requestId?

---

## 🔧 EXPECTED FIX PATTERN

### Fix 1: Prevent Multiple Initializations
```typescript
// instance-shell2.tsx
let mcpBridgeInitialized = false;

onMount(() => {
  if (!mcpBridgeInitialized) {
    initializeMCPBridge(props.instanceId);
    mcpBridgeInitialized = true;
  }
  
  onCleanup(() => {
    cleanupMCPBridge(props.instanceId);
    mcpBridgeInitialized = false;
  });
});
```

### Fix 2: IPC Listener Cleanup
```typescript
// mcp-bridge.ts
const listeners = new Map<string, Function>();

export function initializeMCPBridge(instanceId: string) {
  // Remove old listener if exists
  const oldHandler = listeners.get(`askQuestion-${instanceId}`);
  if (oldHandler) {
    window.electron.ipcRenderer.removeListener('mcp:askQuestion', oldHandler);
  }
  
  // Register new listener
  const handler = (event, data) => {
    // Deduplicate by requestId
    if (isQuestionAlreadyHandled(data.requestId)) return;
    // ... rest of handler
  };
  
  window.electron.ipcRenderer.on('mcp:askQuestion', handler);
  listeners.set(`askQuestion-${instanceId}`, handler);
}

export function cleanupMCPBridge(instanceId: string) {
  const handler = listeners.get(`askQuestion-${instanceId}`);
  if (handler) {
    window.electron.ipcRenderer.removeListener('mcp:askQuestion', handler);
    listeners.delete(`askQuestion-${instanceId}`);
  }
}
```

### Fix 3: Question Store Counter Fix
```typescript
// questions.ts
export function removePendingQuestion(requestId: string) {
  const question = pendingQuestions[requestId];
  if (!question) {
    console.warn('[Questions Store] Attempted to remove non-existent question:', requestId);
    return;
  }
  
  delete pendingQuestions[requestId];
  setPendingQuestionCount(prev => Math.max(0, prev - 1)); // Never go negative
  console.log('[Questions Store] Removed question, new count:', getPendingQuestionCount());
}
```

### Fix 4: Wizard Cleanup Integration
```typescript
// askquestion-wizard.tsx
const handleSubmit = async () => {
  try {
    await sendAnswer(requestId, selectedValue);
    removePendingQuestion(requestId); // ENSURE THIS IS CALLED
    setIsOpen(false);
  } catch (error) {
    console.error('[Question Wizard] Submit failed:', error);
  }
};

const handleCancel = async () => {
  try {
    await sendCancel(requestId);
    removePendingQuestion(requestId); // ENSURE THIS IS CALLED
    setIsOpen(false);
  } catch (error) {
    console.error('[Question Wizard] Cancel failed:', error);
  }
};
```

---

## ⚠️ DEBUGGING TIPS

### Enable Verbose Logging
Add these logs to trace execution:
```typescript
// instance-shell2.tsx
console.log('[Instance Shell] MOUNT START:', props.instanceId, 'Count:', ++mountCounter);
console.log('[Instance Shell] CLEANUP:', props.instanceId, 'Count:', --mountCounter);

// mcp-bridge.ts
console.log('[MCP Bridge] INIT START:', instanceId, 'Active listeners:', listeners.size);
console.log('[MCP Bridge] QUESTION RECEIVED:', requestId, 'Already handled:', isAlreadyHandled);
console.log('[MCP Bridge] ANSWER SENT:', requestId, 'Cleaning up...');

// questions.ts
console.log('[Questions Store] ADD:', requestId, 'New count:', count);
console.log('[Questions Store] REMOVE:', requestId, 'New count:', count);
```

### Test Scenario
1. Start app, open single instance
2. Run subagent with single ask_user call
3. Verify logs show:
   - "MOUNT START" **once**
   - "INIT START" **once**
   - "QUESTION RECEIVED" **once**
   - "ADD" **once** with count=1
   - Answer question
   - "ANSWER SENT" **once**
   - "REMOVE" **once** with count=0

### Success Criteria
✅ Each question received exactly once  
✅ Counter increments by 1 per question  
✅ Counter decrements by 1 per answer/cancel  
✅ Counter reaches 0 after all questions answered  
✅ No timeouts for 20+ consecutive ask_user calls  
✅ Works with multiple concurrent subagents  

---

## 📝 EXPECTED OUTCOMES

### After Fix Applied
1. **Single Event Handling**: Each question logged once in console
2. **Accurate Counter**: Matches actual pending questions
3. **No Timeouts**: ask_user tool reliable in subagents
4. **Clean Lifecycle**: Proper cleanup on instance close
5. **Scalability**: Works with 10+ concurrent subagents

### Testing Checklist
```markdown
- [ ] Single instance, single question → counter 1 → answer → counter 0
- [ ] Single instance, 5 questions → counter 5 → answer all → counter 0
- [ ] Multiple instances, each with questions → independent counters
- [ ] Close instance with pending questions → counter clears
- [ ] Rapid fire 10 subagents with ask_user → no timeouts
- [ ] Cancel questions → counter decrements properly
```

---

## 🚀 NEXT SESSION COMMANDS

### Start Investigation
```bash
# Read key files
cat packages/ui/src/components/instance-shell2.tsx
cat packages/ui/src/lib/mcp-bridge.ts
cat packages/ui/src/stores/questions.ts
cat packages/ui/src/components/askquestion-wizard.tsx

# Search for specific patterns
grep -n "onMount" packages/ui/src/components/instance-shell2.tsx
grep -n "onCleanup" packages/ui/src/components/instance-shell2.tsx
grep -n "ipcRenderer.on" packages/ui/src/lib/mcp-bridge.ts
grep -n "removeListener" packages/ui/src/lib/mcp-bridge.ts
grep -n "removePendingQuestion" packages/ui/src/components/askquestion-wizard.tsx
```

### After Fix Implementation
```bash
# Test the fix
npm run dev

# In app: Run test subagent with ask_user calls
# Monitor console for:
# 1. Single "Received question" per question
# 2. Counter incrementing correctly
# 3. Counter decrementing after answer
# 4. No duplicate logs
```

---

## 🔗 RELATED CONTEXT

### Fork-Specific Feature
This `ask_user` MCP tool is a **custom CodeNomad fork feature**, not present in upstream. It uses:
- Custom IPC channel: `mcp:askQuestion`, `mcp:answerQuestion`, `mcp:cancelQuestion`
- Custom UI: `askquestion-wizard.tsx` modal component
- Custom state: `questions.ts` store with counter
- Integration: `instance-shell2.tsx` initializes on mount

### Architecture
```
SubAgent (MCP Server)
  ↓ IPC: mcp:askQuestion
Electron Main Process
  ↓ Forward to Renderer
MCP Bridge (mcp-bridge.ts)
  ↓ IPC handler: on('mcp:askQuestion')
Questions Store (questions.ts)
  ↓ addPendingQuestion()
AskQuestion Wizard (askquestion-wizard.tsx)
  ↓ User answers
  ↓ sendAnswer() via MCP Bridge
  ↓ removePendingQuestion()
Electron Main Process
  ↓ IPC: mcp:answerQuestion
SubAgent (MCP Server)
  ↓ Continues execution
```

### Known Good State
- **Before Bug**: Single initialization, single question handling
- **Current State**: 3x initialization, 3x question handling, counter accumulation
- **Likely Cause**: Recent refactor or upstream merge introduced lifecycle issues

---

## 📚 REFERENCE LOGS

### Full Console Sequence (2026-01-19 14:40:14)
```
instance-shell2.tsx:202 [Instance Shell] onMount fired for instance: mkkd2vy8
mcp-bridge.ts:24 [MCP Bridge UI] Initializing MCP bridge for instance: mkkd2vy8
instance-shell2.tsx:202 [Instance Shell] onMount fired for instance: mkkd2vy8
mcp-bridge.ts:24 [MCP Bridge UI] Initializing MCP bridge for instance: mkkd2vy8
instance-shell2.tsx:202 [Instance Shell] onMount fired for instance: mkkd2vy8
mcp-bridge.ts:24 [MCP Bridge UI] Initializing MCP bridge for instance: mkkd2vy8

mcp-bridge.ts:76 [MCP Bridge UI] Received question: {requestId: 'req_1768779214029_atnlu1qq6', questions: Array(1), instanceId: 'mkkd2vy8', ...}
askquestion-wizard.tsx:83 [Question Wizard] Opening wizard for question: req_1768779214029_atnlu1qq6
askquestion-wizard.tsx:88 [Question Wizard] Wizard opened successfully

mcp-bridge.ts:76 [MCP Bridge UI] Received question: {requestId: 'req_1768779214029_atnlu1qq6', ...}
askquestion-wizard.tsx:83 [Question Wizard] Opening wizard for question: req_1768779214029_atnlu1qq6
askquestion-wizard.tsx:88 [Question Wizard] Wizard opened successfully

mcp-bridge.ts:76 [MCP Bridge UI] Received question: {requestId: 'req_1768779214029_atnlu1qq6', ...}
askquestion-wizard.tsx:83 [Question Wizard] Opening wizard for question: req_1768779214029_atnlu1qq6
askquestion-wizard.tsx:88 [Question Wizard] Wizard opened successfully

mcp-bridge.ts:112 [MCP Bridge UI] Sending answer for req_1768779214029_atnlu1qq6
mcp-bridge.ts:117 [MCP Bridge UI] Answer sent successfully

[Multiple similar patterns for subsequent questions: req_1768781344166_vwjapj2zf, req_1768781372754_qvshpxniq, req_1768781431451_lrgtyzqo3]

mcp-bridge.ts:130 [MCP Bridge UI] Sending cancel for req_1768781431451_lrgtyzqo3: user_cancelled
mcp-bridge.ts:135 [MCP Bridge UI] Cancel sent successfully
```

---

## ✅ SUCCESS METRICS

After successful debug session:
1. **Console Clean**: Each question appears **once** in logs
2. **Counter Accurate**: Reflects actual pending questions (not accumulated)
3. **No Timeouts**: 20+ consecutive ask_user calls succeed
4. **User Confidence**: Trust restored in ask_user tool for subagents

---

**Debug Mode Recommendation**: Use "Claudette Debug v4" or "systematic-debugging" skill for structured investigation approach.

**Estimated Complexity**: MEDIUM (lifecycle management + IPC cleanup)  
**Estimated Time**: 45-90 minutes (investigation + fix + testing)  
**Risk Level**: LOW (isolated to fork feature, no upstream conflicts)
