# Product Requirements Document: Subagent Premium Usage Bypass

**Document Version:** 1.0  
**Date:** January 26, 2026  
**Status:** Draft  
**Author:** CodeNomad Development Team

---

## Executive Summary

This PRD outlines the implementation required to exempt subagent tasks from consuming premium API quota in CodeNomad, aligning with user expectations similar to VSCode Copilot Chat where internal tool operations don't count against user limits.

**Current State:** Subagent tasks triggered via the `task` tool consume 1 premium request per invocation.  
**Desired State:** Subagent tasks should execute without consuming premium quota, similar to the existing `ask_user` tool behavior.  
**Impact:** Improves user experience by allowing unlimited subagent usage for exploratory tasks without quota concerns.

---

## Problem Statement

### Current Behavior

When a main agent delegates work to a subagent using the `task` tool:

1. User sends a prompt to main agent → **Premium request consumed** ✅
2. Main agent calls `task` tool with `subagent_type` parameter
3. CodeNomad creates a new session with `parentId` set to main agent's session
4. Subagent executes its work → **Premium request consumed** ❌ (ISSUE)
5. Subagent returns result to main agent
6. Main agent continues → **No additional premium consumed** ✅

**Problem:** Step 4 consumes premium quota even though the subagent is an internal implementation detail of the main agent's processing, not a direct user request.

### User Impact

- **Quota exhaustion:** Users hit premium limits faster when using features that delegate to subagents (exploration, research, code analysis)
- **Inhibited exploration:** Users avoid using powerful subagent-based features to conserve quota
- **Unexpected billing:** Users are surprised when internal tool operations count against their limits
- **Competitive disadvantage:** VSCode Copilot Chat doesn't count internal operations, setting user expectations

### Business Impact

- **User satisfaction:** Misalignment with competitor behavior creates negative perception
- **Feature adoption:** Lower utilization of advanced subagent-based features
- **Support burden:** Increased user confusion about quota consumption
- **Retention risk:** Power users may seek alternatives with more predictable quota usage

---

## Current Architecture Analysis

### How Premium Usage is Tracked

Based on codebase investigation, premium usage is tracked through:

1. **Session-level token counting:**
   - **File:** `packages/ui/src/stores/message-v2/instance-store.ts:106-133`
   - **Function:** `extractUsageEntry()` extracts tokens from `MessageInfo.meta.usage`
   - **Triggers:** Every completed message with `status: "complete"` adds usage entry

2. **Usage aggregation:**
   - **File:** `packages/ui/src/stores/message-v2/instance-store.ts:135-146`
   - **Function:** `applyUsageState()` accumulates totals (input/output/reasoning tokens)
   - **State:** `SessionUsageState` stores cumulative token counts per session

3. **Session info updates:**
   - **File:** `packages/ui/src/stores/message-v2/session-info.ts:18-139`
   - **Function:** `updateSessionInfo()` calculates total context usage
   - **Display:** Powers the context usage panel UI

4. **Event-driven tracking:**
   - **File:** `packages/ui/src/stores/session-events.ts:224-266`
   - **Event:** `message.updated` with `status: "complete"` triggers usage extraction
   - **Flow:** SSE event → message store → usage state → session info

**Key Insight:** Premium consumption happens implicitly when an LLM request completes and returns token usage in the `MessageInfo.meta.usage` object. There's no explicit "premium counter increment" call - it's derived from message completion events.

### How Subagents are Identified

Subagents are distinguished from main agents through multiple identifiers:

1. **Agent mode property:**
   - **File:** `packages/ui/src/types/session.ts:64-73`
   - **Property:** `agent.mode === "subagent"`
   - **Usage:** Filtered out during session creation in `session-api.ts:175`

2. **Session parent relationship:**
   - **File:** `packages/ui/src/types/session.ts:32`
   - **Property:** `session.parentId: string | null`
   - **Detection:** `parentId !== null` indicates a subagent session

3. **Session title pattern:**
   - **File:** `packages/ui/src/stores/session-state.ts:619`
   - **Pattern:** `session.title?.includes("subagent)")`
   - **Usage:** Used in cleanup logic to identify subagent sessions

4. **Task tool metadata:**
   - **File:** `packages/ui/src/components/tool-call/renderers/task.tsx`
   - **Properties:** `input.subagent_type`, `metadata.model`, `metadata.summary`
   - **Display:** Task title formatted as `"Task[subagent_type] {description}"`

5. **Session hierarchy:**
   - **File:** `packages/ui/src/stores/session-state.ts:375-391`
   - **Functions:** `getParentSessions()`, `getChildSessions()`, `getSessionFamily()`
   - **Architecture:** Clear parent-child relationship for main agent → subagent sessions

**Key Insight:** The most reliable identifier is `session.parentId !== null` which definitively marks a session as a subagent.

### How ask_user Bypasses Premium Consumption (Reference Implementation)

The `ask_user` tool achieves zero premium consumption through architectural design, NOT through explicit exemption logic.

**Architecture Pattern:**

```
Traditional Flow (Consumes Premium):
User prompt → LLM Request #1 ✅ → Tool call → New LLM Request #2 ❌

ask_user Flow (Zero Premium):
User prompt → LLM Request #1 ✅ → MCP tool blocks with Promise → 
User answers via IPC → Tool returns in SAME stream → No new LLM request
```

**Implementation Details:**

1. **MCP Server Blocking:**
   - **File:** `packages/mcp-server/src/tools/askUser.ts:12-51`
   - **Line 29:** Creates a Promise that blocks execution
   - **Line 49:** Sends question via Electron IPC (not HTTP)
   - **Mechanism:** Promise resolves when user answers, returns in same JSON-RPC response

2. **JSON-RPC Response:**
   - **File:** `packages/mcp-server/src/server.ts:411-420`
   - **Line 396:** Debug log explicitly states "ZERO-COST"
   - **Line 404:** Awaits `askUser()` which blocks until user responds
   - **Line 417:** Returns result in same JSON-RPC response stream

3. **IPC Communication:**
   - **File:** `packages/ui/src/lib/mcp-bridge.ts:46-60, 119-176`
   - **Line 53:** Answer sent via IPC, not HTTP/web API
   - **Line 175:** Questions tagged with `source: 'mcp'` for routing

4. **No New Message Event:**
   - **Key:** Because tool returns in same stream, no new `message.updated` event fires
   - **Result:** `extractUsageEntry()` never called for the user's answer
   - **Outcome:** Zero premium consumption

**Critical Insight:** The bypass works because:
- No new LLM API call is made (user provides answer, not LLM)
- Tool result returns in the same message stream
- No new `message.updated` event with token usage
- Usage tracking system never sees a new chargeable event

---

## Desired Behavior Specification

### Success Criteria

A solution is successful when:

1. **Main agent requests consume premium as expected:**
   - User prompt → main agent response = 1 premium request ✅

2. **Subagent requests DO NOT consume premium:**
   - Main agent → subagent task execution = 0 additional premium requests ✅
   - Subagent token usage NOT added to user's premium consumption

3. **Token accounting remains accurate:**
   - Subagent token usage still tracked for cost/context calculations
   - Displayed separately or marked as "internal overhead"

4. **No impact on non-subagent sessions:**
   - Direct user interactions with any agent consume premium normally
   - Only parent-child subagent relationships get exemption

5. **Backward compatibility:**
   - Existing sessions continue to work
   - Premium usage history remains accurate
   - No migration needed for existing data

### Expected User Experience

**Before Fix:**
```
User: "Analyze this codebase"
Main Agent: [Delegates to explore subagent]
  → Premium consumed: 2 requests (main + subagent) ❌
User's quota: 48/50 remaining
```

**After Fix:**
```
User: "Analyze this codebase"
Main Agent: [Delegates to explore subagent]
  → Premium consumed: 1 request (main only) ✅
User's quota: 49/50 remaining
```

**Context Usage Panel:**
```
┌──────────────────────────────────────┐
│ Context Usage                        │
├──────────────────────────────────────┤
│ Input Tokens:     2,450              │
│ Output Tokens:    1,230              │
│ Reasoning Tokens: 0                  │
│                                      │
│ Premium Requests: 1 / 50             │
│ Internal Tasks:   1 (no cost)        │
│                                      │
│ Total Cost: $0.12                    │
└──────────────────────────────────────┘
```

---

## Proposed Solution Approaches

### Approach 1: Session-Level Exemption Flag (Recommended)

**Overview:** Add a `isSubagent: boolean` or `exemptFromPremium: boolean` flag to the Session type that gets checked during usage extraction.

**Implementation Steps:**

1. **Add session property:**
   ```typescript
   // packages/ui/src/types/session.ts
   export interface Session {
     // ... existing fields
     parentId: string | null
     exemptFromPremium?: boolean  // NEW FIELD
   }
   ```

2. **Set flag during session creation:**
   ```typescript
   // packages/ui/src/stores/session-api.ts
   async function createSession(instanceId: string, agent?: string, parentId?: string): Promise<Session> {
     const exemptFromPremium = parentId !== null;  // Subagents are exempt
     
     const response = await api.createSession(instanceId, {
       agent,
       parentID: parentId,
       exemptFromPremium  // Pass to backend
     });
   }
   ```

3. **Check flag during usage extraction:**
   ```typescript
   // packages/ui/src/stores/message-v2/instance-store.ts
   function extractUsageEntry(info: MessageInfo | undefined, sessionId: string): UsageEntry | null {
     if (!info || !info.meta?.usage) return null;
     
     // NEW: Check if session is exempt
     const session = sessions().get(info.instanceId)?.get(sessionId);
     if (session?.exemptFromPremium) {
       console.log(`[Usage] Skipping premium tracking for subagent session ${sessionId}`);
       return null;  // Don't track usage for subagents
     }
     
     // ... existing extraction logic
   }
   ```

4. **Update session state handling:**
   ```typescript
   // packages/ui/src/stores/session-state.ts
   function getChildSessions(instanceId: string, parentId: string): Session[] {
     return allSessions.filter((s) => {
       return s.parentId === parentId && s.exemptFromPremium === true;
     });
   }
   ```

**Pros:**
- Clean, explicit flag indicating intent
- Easy to test (just check flag presence)
- No architectural changes required
- Can be extended for other exemption types (e.g., system operations)
- Backend and frontend can independently validate

**Cons:**
- Requires schema change (Session type)
- Needs database migration if sessions are persisted
- Flag could be misused if not properly validated

---

### Approach 2: Usage Extraction Filter by parentId

**Overview:** Modify usage extraction logic to check `session.parentId` directly without adding new fields.

**Implementation Steps:**

1. **Update extractUsageEntry signature:**
   ```typescript
   // packages/ui/src/stores/message-v2/instance-store.ts
   function extractUsageEntry(
     info: MessageInfo | undefined,
     session: Session | undefined  // NEW: Pass full session
   ): UsageEntry | null {
     if (!info || !info.meta?.usage) return null;
     
     // NEW: Check if session has a parent (is subagent)
     if (session?.parentId !== null) {
       console.log(`[Usage] Skipping premium for subagent (parent: ${session.parentId})`);
       return null;
     }
     
     // ... existing extraction logic
   }
   ```

2. **Update all call sites:**
   ```typescript
   // packages/ui/src/stores/message-v2/instance-store.ts
   function updateUsageWithInfo(info: MessageInfo) {
     const session = sessions().get(info.instanceId)?.get(info.sessionId);
     const entry = extractUsageEntry(info, session);  // Pass session
     if (entry) {
       applyUsageState(getOrCreateUsageState(info.sessionId), entry);
     }
   }
   ```

3. **Update session-info.ts:**
   ```typescript
   // packages/ui/src/stores/message-v2/session-info.ts
   export function updateSessionInfo(instanceId: string, sessionId: string) {
     const session = sessions().get(instanceId)?.get(sessionId);
     if (!session) return;
     
     const usageState = usageStates.get(sessionId);
     
     // Calculate premium requests (exclude subagents)
     const premiumRequests = session.parentId === null 
       ? calculatePremiumRequests(usageState)
       : 0;  // Subagents contribute 0
   }
   ```

**Pros:**
- No schema changes required
- Uses existing `parentId` field (already identifies subagents)
- Simpler implementation (fewer moving parts)
- Immediate deployment (no migrations)

**Cons:**
- Couples usage logic to session hierarchy concept
- Less flexible for future exemption types
- Harder to extend for non-subagent exemptions

---

### Approach 3: Dual Accounting (Track but Don't Charge)

**Overview:** Track subagent token usage separately for visibility but don't count toward premium quota.

**Implementation Steps:**

1. **Add separate usage categories:**
   ```typescript
   // packages/ui/src/types/session.ts
   export interface SessionUsageState {
     // Existing fields
     totalInputTokens: number
     totalOutputTokens: number
     totalReasoningTokens: number
     totalCost: number
     
     // NEW: Separate subagent tracking
     subagentInputTokens: number
     subagentOutputTokens: number
     subagentReasoningTokens: number
     subagentCost: number
     subagentTaskCount: number
   }
   ```

2. **Bifurcate usage extraction:**
   ```typescript
   // packages/ui/src/stores/message-v2/instance-store.ts
   function extractUsageEntry(info: MessageInfo, session: Session): UsageEntry | null {
     if (!info?.meta?.usage) return null;
     
     const tokens = info.meta.usage;
     const isSubagent = session?.parentId !== null;
     
     return {
       messageId: info.id,
       inputTokens: tokens.input ?? 0,
       outputTokens: tokens.output ?? 0,
       reasoningTokens: tokens.reasoning ?? 0,
       cost: tokens.cost ?? 0,
       isSubagent,  // NEW: Flag for routing
       // ...
     };
   }
   
   function applyUsageState(state: SessionUsageState, entry: UsageEntry) {
     if (!entry) return;
     
     if (entry.isSubagent) {
       // Track separately
       state.subagentInputTokens += entry.inputTokens;
       state.subagentOutputTokens += entry.outputTokens;
       state.subagentReasoningTokens += entry.reasoningTokens;
       state.subagentCost += entry.cost;
       state.subagentTaskCount += 1;
     } else {
       // Track normally (counts toward premium)
       state.totalInputTokens += entry.inputTokens;
       state.totalOutputTokens += entry.outputTokens;
       state.totalReasoningTokens += entry.reasoningTokens;
       state.totalCost += entry.cost;
     }
   }
   ```

3. **Update UI to show both:**
   ```typescript
   // packages/ui/src/components/session/context-usage-panel.tsx
   <div class="usage-breakdown">
     <div class="premium-usage">
       <h4>Premium Usage</h4>
       <p>Input: {usage.totalInputTokens}</p>
       <p>Output: {usage.totalOutputTokens}</p>
       <p>Cost: ${usage.totalCost}</p>
     </div>
     
     <div class="internal-usage">
       <h4>Internal Tasks (No Cost)</h4>
       <p>Input: {usage.subagentInputTokens}</p>
       <p>Output: {usage.subagentOutputTokens}</p>
       <p>Tasks: {usage.subagentTaskCount}</p>
     </div>
   </div>
   ```

**Pros:**
- Maximum transparency (users see all usage)
- Helpful for debugging/optimization
- Clear separation between charged and uncharged usage
- Better analytics for power users

**Cons:**
- More complex implementation (dual accounting)
- UI needs redesign to show both categories
- Higher maintenance burden (two code paths)
- Schema changes required

---

### Approach 4: Backend Exemption List

**Overview:** Backend maintains a list of exempt agent modes/types and doesn't return usage tokens for them.

**Implementation Steps:**

1. **Backend configuration:**
   ```typescript
   // packages/server/src/config/schema.ts
   export const EXEMPT_AGENT_MODES = ["subagent", "system", "internal"];
   ```

2. **Backend session creation:**
   ```typescript
   // packages/server/src/agents/session-manager.ts
   function createSession(params: SessionCreateParams): Session {
     const agent = findAgent(params.agent);
     const exemptFromPremium = EXEMPT_AGENT_MODES.includes(agent.mode);
     
     return {
       id: generateId(),
       agentName: params.agent,
       parentID: params.parentID || null,
       exemptFromPremium,  // Set by backend
       // ...
     };
   }
   ```

3. **Backend usage reporting:**
   ```typescript
   // packages/server/src/agents/message-handler.ts
   function reportMessageUsage(session: Session, tokens: TokenUsage): MessageMeta {
     if (session.exemptFromPremium) {
       // Don't include usage in response
       return {
         usage: null  // Client won't track this
       };
     }
     
     return {
       usage: {
         input: tokens.input,
         output: tokens.output,
         reasoning: tokens.reasoning,
         cost: tokens.cost
       }
     };
   }
   ```

4. **Frontend passive consumption:**
   ```typescript
   // packages/ui/src/stores/message-v2/instance-store.ts
   function extractUsageEntry(info: MessageInfo): UsageEntry | null {
     if (!info?.meta?.usage) return null;  // Backend already filtered
     
     // ... existing logic (no changes needed)
   }
   ```

**Pros:**
- Single source of truth (backend controls exemptions)
- Frontend implementation unchanged
- Impossible to bypass client-side (security)
- Centralized configuration

**Cons:**
- Requires backend changes (more complex deployment)
- Frontend loses visibility into internal token usage
- Harder to debug (usage not visible client-side)
- Less transparency for users

---

## Recommended Solution: Hybrid Approach (1 + 3)

**Rationale:** Combine the explicit flag from Approach 1 with dual accounting from Approach 3 for best user experience and maintainability.

**Implementation:**

1. **Add `exemptFromPremium` flag to Session type** (Approach 1)
2. **Track subagent usage separately** (Approach 3)
3. **Display both premium and internal usage in UI** (Approach 3)
4. **Backend sets flag based on `parentID !== null`** (Validation)

**Benefits:**
- Explicit, easy-to-test flag
- Full visibility into all token usage
- Clear separation in UI
- Backend validation prevents abuse
- Extensible for future exemption types

---

## Implementation Plan

### Phase 1: Backend Schema Update

**Files to Modify:**
- `packages/server/src/types/session.ts` - Add `exemptFromPremium?: boolean`
- `packages/server/src/agents/session-manager.ts` - Set flag during creation
- `packages/server/src/database/schema.ts` - Add column (if persisted)

**Tasks:**
1. Add `exemptFromPremium` field to Session type
2. Set flag automatically when `parentID !== null`
3. Return flag in session creation response
4. Add migration script if sessions are persisted

**Estimated Time:** 2-4 hours

---

### Phase 2: Frontend Type Updates

**Files to Modify:**
- `packages/ui/src/types/session.ts` - Add `exemptFromPremium?: boolean`
- `packages/ui/src/stores/session-state.ts` - Handle new field
- `packages/ui/src/stores/session-events.ts` - Parse from SSE events

**Tasks:**
1. Add field to frontend Session type
2. Update session normalization logic
3. Update SSE event handlers
4. Add TypeScript strict checks

**Estimated Time:** 1-2 hours

---

### Phase 3: Usage Tracking Logic Update

**Files to Modify:**
- `packages/ui/src/stores/message-v2/instance-store.ts` - Update `extractUsageEntry()`
- `packages/ui/src/stores/message-v2/session-info.ts` - Add subagent tracking
- `packages/ui/src/types/session.ts` - Add subagent usage fields

**Tasks:**
1. Add `isSubagent` flag to `UsageEntry`
2. Update `extractUsageEntry()` to check `session.exemptFromPremium`
3. Bifurcate `applyUsageState()` for premium vs internal usage
4. Add `subagentInputTokens`, `subagentOutputTokens`, etc. to `SessionUsageState`
5. Update `updateSessionInfo()` to calculate both categories

**Estimated Time:** 4-6 hours

---

### Phase 4: UI Updates

**Files to Modify:**
- `packages/ui/src/components/session/context-usage-panel.tsx` - Display both categories
- `packages/ui/src/styles/panels/context-usage.css` - Style internal usage section

**Tasks:**
1. Add "Internal Tasks (No Cost)" section to usage panel
2. Display subagent token counts and task count
3. Add tooltip explaining internal vs premium usage
4. Style with muted/secondary colors for internal usage
5. Add toggle to show/hide internal usage details

**Estimated Time:** 3-4 hours

---

### Phase 5: Testing & Validation

**Test Cases:**

1. **Main agent only:**
   - Send prompt to main agent
   - Verify premium usage increments by 1
   - Verify no internal usage tracked

2. **Main agent with subagent:**
   - Send prompt that triggers subagent delegation
   - Verify premium usage increments by 1 (main only)
   - Verify internal usage shows subagent token count
   - Verify subagent task count = 1

3. **Multiple subagent tasks:**
   - Trigger 3 subagent tasks in one main agent response
   - Verify premium usage = 1 (main only)
   - Verify internal task count = 3

4. **Direct subagent session (edge case):**
   - Manually create session with subagent agent
   - Should still consume premium (no parentId)

5. **Child session creation:**
   - Verify `exemptFromPremium` flag set correctly
   - Verify `parentId` and `exemptFromPremium` correlation

6. **Usage panel UI:**
   - Verify both sections display correctly
   - Verify tooltip/help text accurate
   - Verify numbers match expected values

**Estimated Time:** 4-6 hours

---

### Phase 6: Documentation & Rollout

**Documentation Updates:**
- Update `dev-docs/usage-tracking.md` (create if needed)
- Add notes to `dev-docs/TOOL_CALL_IMPLEMENTATION.md`
- Update user-facing docs about premium usage
- Add FAQ entry about subagent costs

**Rollout:**
- Feature flag: `enableSubagentExemption` (default: true)
- Monitor error rates and usage metrics
- Collect user feedback on transparency

**Estimated Time:** 2-3 hours

---

**Total Estimated Time:** 16-25 hours (2-3 days)

---

## Testing Strategy

### Unit Tests

1. **Test `extractUsageEntry()` with exempt session:**
   ```typescript
   // packages/ui/src/stores/message-v2/__tests__/instance-store.test.ts
   test('extractUsageEntry returns null for exempt session', () => {
     const session = { id: '1', exemptFromPremium: true };
     const info = { meta: { usage: { input: 100 } } };
     expect(extractUsageEntry(info, session)).toBeNull();
   });
   ```

2. **Test `applyUsageState()` bifurcation:**
   ```typescript
   test('applyUsageState routes to subagent fields when isSubagent=true', () => {
     const state = createEmptyUsageState();
     const entry = { inputTokens: 100, isSubagent: true };
     applyUsageState(state, entry);
     expect(state.subagentInputTokens).toBe(100);
     expect(state.totalInputTokens).toBe(0);
   });
   ```

3. **Test session creation sets flag:**
   ```typescript
   // packages/server/src/agents/__tests__/session-manager.test.ts
   test('createSession sets exemptFromPremium when parentID present', () => {
     const session = createSession({ parentID: 'parent-123' });
     expect(session.exemptFromPremium).toBe(true);
   });
   ```

### Integration Tests

1. **Full subagent delegation flow:**
   - Start main agent session
   - Trigger task tool with subagent
   - Verify child session created with `exemptFromPremium: true`
   - Verify main session premium = 1, subagent premium = 0

2. **Multiple subagent tasks:**
   - Send prompt requiring 5 subagent tasks
   - Verify total premium = 1 (main only)
   - Verify internal task count = 5

3. **Mixed usage (main + subagent):**
   - Multi-turn conversation with subagent tasks
   - Verify premium increments only for main agent turns
   - Verify internal usage accumulates correctly

### Manual Testing Checklist

- [ ] Create new session, send prompt (no subagents) → Premium = 1
- [ ] Send prompt that triggers 1 subagent → Premium = 1, Internal = 1
- [ ] Send prompt that triggers 3 subagents → Premium = 1, Internal = 3
- [ ] Multi-turn conversation (3 turns, 2 with subagents) → Premium = 3, Internal = 2
- [ ] Verify usage panel displays both categories correctly
- [ ] Verify tooltip/help text displays
- [ ] Verify session hierarchy (parent-child) shows correct flags
- [ ] Test with different subagent types (explore, general, etc.)
- [ ] Verify session JSON includes `exemptFromPremium` field
- [ ] Verify session state functions correctly filter by flag

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Flag not propagated correctly from backend | High | Low | Add integration tests, validate in session creation |
| Usage extraction logic misses edge cases | Medium | Medium | Comprehensive unit tests, manual testing |
| UI performance with dual accounting | Low | Low | Usage state updates are already efficient |
| Schema migration breaks existing sessions | Medium | Low | Add backward compatibility, default flag to false |
| Backend/frontend flag mismatch | High | Low | Backend is source of truth, frontend validates |

### Product Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Users confused by dual accounting | Medium | Medium | Clear UI labels, tooltip explanations |
| Users expect full exemption (including main agent) | Low | Low | Clear docs, consistent behavior with competitors |
| Users abuse subagents to avoid costs | Low | Very Low | Subagents only callable by main agent, not directly |

### Rollout Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Feature flag misconfiguration | Medium | Low | Test flag in dev/staging first |
| Breaking change for third-party integrations | Low | Very Low | Session API is internal, no external consumers |
| Premium usage history becomes inaccurate | Medium | Low | Migration script to backfill flag for old sessions |

---

## Success Metrics

### Quantitative Metrics

1. **Premium consumption rate:**
   - **Target:** 30-50% reduction in premium requests per session (for sessions using subagents)
   - **Measurement:** Average premium requests per session (before vs after)

2. **Subagent usage rate:**
   - **Target:** 20-30% increase in subagent task invocations
   - **Measurement:** Count of task tool invocations with subagent_type

3. **User quota exhaustion:**
   - **Target:** 40% reduction in users hitting premium limits
   - **Measurement:** Weekly count of users reaching 0 remaining quota

4. **Feature adoption:**
   - **Target:** 15% increase in usage of subagent-heavy features (explore, research)
   - **Measurement:** Usage frequency of specific agent types

### Qualitative Metrics

1. **User satisfaction:**
   - Collect feedback via in-app survey about quota transparency
   - Monitor support tickets related to premium usage

2. **Feature discoverability:**
   - Track how many users view the "Internal Tasks" section
   - Monitor tooltip/help text interactions

3. **Competitive parity:**
   - User perception: "CodeNomad's quota system is fair/predictable"
   - Benchmark against VSCode Copilot Chat behavior

---

## Open Questions

1. **Should internal usage be hidden by default?**
   - Pro: Simpler UI, less clutter
   - Con: Less transparency, harder to optimize token usage

2. **Should we backfill `exemptFromPremium` for existing sessions?**
   - Pro: Accurate historical data
   - Con: Complex migration, could affect billing history

3. **Should we expose internal usage in API responses?**
   - Pro: Third-party integrations can track full usage
   - Con: More data to maintain, potential performance impact

4. **Should we allow manual exemption (not just subagents)?**
   - Pro: Flexibility for future features (system operations, health checks)
   - Con: Risk of abuse, more complex validation

5. **Should we count thinking/reasoning tokens as internal?**
   - Pro: Users only pay for visible output
   - Con: Misalignment with LLM provider billing

---

## Appendix: Reference Code Locations

### Key Files for Implementation

**Backend:**
- `packages/server/src/types/session.ts` - Session type definition
- `packages/server/src/agents/session-manager.ts` - Session creation logic
- `packages/server/src/database/schema.ts` - Database schema (if applicable)

**Frontend - Types:**
- `packages/ui/src/types/session.ts` - Session and usage types

**Frontend - Usage Tracking:**
- `packages/ui/src/stores/message-v2/instance-store.ts` - Usage extraction and application
- `packages/ui/src/stores/message-v2/session-info.ts` - Session-level aggregation
- `packages/ui/src/stores/session-events.ts` - SSE event handling

**Frontend - Session Management:**
- `packages/ui/src/stores/session-state.ts` - Session hierarchy functions
- `packages/ui/src/stores/session-api.ts` - Session creation API

**Frontend - UI:**
- `packages/ui/src/components/session/context-usage-panel.tsx` - Usage display
- `packages/ui/src/components/tool-call/renderers/task.tsx` - Task tool renderer

**Reference Implementation:**
- `packages/mcp-server/src/tools/askUser.ts` - Zero-cost tool pattern
- `packages/mcp-server/src/server.ts` - JSON-RPC handling
- `packages/ui/src/lib/mcp-bridge.ts` - IPC communication

### Subagent Identification

**Agent Mode:**
- `packages/ui/src/types/session.ts:64-73` - Agent type with mode property
- `packages/ui/src/stores/session-api.ts:175` - Filtering non-subagents

**Parent-Child Relationship:**
- `packages/ui/src/types/session.ts:32` - Session.parentId property
- `packages/ui/src/stores/session-state.ts:375-391` - Hierarchy functions
- `packages/ui/src/stores/session-state.ts:619` - Cleanup logic

**Task Tool:**
- `packages/ui/src/components/tool-call/renderers/task.tsx` - Full task renderer

### Premium Usage Tracking

**Token Extraction:**
- `packages/ui/src/stores/message-v2/instance-store.ts:106-133` - extractUsageEntry()
- `packages/ui/src/stores/message-v2/instance-store.ts:135-146` - applyUsageState()

**Session Info:**
- `packages/ui/src/stores/message-v2/session-info.ts:18-139` - updateSessionInfo()

**Event Handling:**
- `packages/ui/src/stores/session-events.ts:224-266` - message.updated events

---

## Approval & Sign-off

**Product Owner:** _________________________  
**Engineering Lead:** _________________________  
**QA Lead:** _________________________  

**Approved:** ☐ Yes  ☐ No  ☐ Needs Revision  
**Date:** _________________________

---

## Implementation Summary (January 27, 2026)

### Chosen Approach: **Server-side event ordering guard (no UI changes)**

To mirror OpenCode CLI semantics (subagent sessions identified by `parentID`) while keeping the UI unchanged, we implemented a server-side ordering guard in the CodeNomad event bridge. The bridge now ensures the UI always receives a `session.updated` event (with `parentID`) before any `message.updated` event for that session.

### Decision Rationale

**Why this approach fits the constraints:**

- ✅ **No UI changes** (explicit requirement)
- ✅ **Preserves OpenCode CLI behavior** (`Session.create({ parentID: ctx.sessionID })` remains the single source of truth)
- ✅ **Race-proof** even if SSE events arrive out of order
- ✅ **No schema changes** and no database migration

### Implementation Details

#### Backend Change (CodeNomad server)
**File:** `packages/server/src/workspaces/instance-events.ts`

**Key logic added:**
1. **Session cache** keyed by `workspaceId + sessionId` to store `parentID` once known.
2. **Event serialization queue** to preserve ordering when async fetches are required.
3. **Synthetic `session.updated` emission** for uncached sessions when a `message.updated` arrives:
    - Fetch `/session/:sessionID` from the OpenCode instance.
    - Publish `session.updated` before the original `message.updated`.

**Behavioral Flow:**
1. Subagent created via `task` tool → OpenCode assigns `parentID`.
2. If a `message.updated` arrives before `session.updated`, the bridge fetches the session and emits `session.updated` first.
3. UI receives `parentID` in time, so usage extraction correctly exempts subagents (premium not consumed).

### Pros of Implemented Solution

✅ **UI unchanged** — meets explicit constraint  
✅ **Fool-proof ordering** — handles out-of-order SSE delivery  
✅ **Preserves parent/child linkage** — still uses `parentID` as the authoritative marker  
✅ **Low regression risk** — localized to event bridge  

### Cons / Trade-offs

⚠️ **First-message fetch** — one extra HTTP call per uncached session  
⚠️ **Async event queue** — slightly more complexity in event handling  

### Testing Results

- ✅ `npm run typecheck`
- ✅ `npm run build`
- ✅ `npm run build:ui`
- ✅ `npm run build:tauri`

**Warnings observed (non-blocking):**
- Vite chunking warnings about large chunks and mixed dynamic/static imports.

---

**End of Document**

