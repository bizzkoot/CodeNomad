# Reactive ask_user MCP Retry System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a reactive retry mechanism for ask_user MCP that detects UI rendering failures and instructs the agent to retry within the same session without triggering premium requests.

**Architecture:** Add a render-confirmation heartbeat system where UI must acknowledge question display within 30 seconds. If no confirmation, return `shouldRetry: true` with clear directive. Distinguish between "UI didn't render" (retry) and "User didn't respond" (timeout). Update tool schema description to instruct agents on retry behavior. Enhance question schema with structured options (label+description), header field, and custom answer toggle like OpenCode.

**Tech Stack:** TypeScript, Zod, Node.js EventEmitter pattern, Electron IPC

---

## Prerequisites

- Current timeout: 5 minutes (300000ms)
- No automatic retry exists beyond 1 UI-level attempt
- Agent receives `{ timedOut: true }` but doesn't know to retry
- Goal: Zero additional premium requests on retry

---

## Overview of Changes

### New Schema Fields (CnAskUserOutput)

```typescript
{
  answered: boolean,
  cancelled: boolean,
  timedOut: boolean,
  shouldRetry: boolean,        // NEW: Agent should retry this question
  retryReason: string | null,  // NEW: Why retry is needed (for debugging)
  renderConfirmed: boolean,    // NEW: Whether UI confirmed display
  answers: QuestionAnswer[]
}
```

### New Input Parameter (CnAskUserInput)

```typescript
{
  questions: [...],
  title?: string,
  maxRetries?: number,         // NEW: Max retry attempts (default: 3)
    renderTimeout?: number       // NEW: Time to wait for UI render confirmation (default: 30000ms)
}
```

### Flow Changes

1. **Question Sent** → Start 30s render confirmation timer
2. **UI Confirms** → Cancel render timer, start 5min user response timer
3. **No Confirmation in 30s** → Return `shouldRetry: true, retryReason: "UI render timeout"`
4. **Agent Receives shouldRetry** → Retries ask_user immediately (same session)
5. **Max Retries Exceeded** → Return `shouldRetry: false, error: "Max retries exceeded"`

---

## Task 1: Update Schemas with New Fields

**Files:**
- Modify: `packages/mcp-server/src/tools/schemas.ts`
- Test: `packages/mcp-server/src/__tests__/schemas.test.ts` (create if doesn't exist)

**Step 1: Update CnAskUserInputSchema**

Add `maxRetries` and `renderTimeout` optional parameters:

```typescript
export const CnAskUserInputSchema = z.object({
    questions: z.array(QuestionInfoSchema).min(1).max(10),
    title: z.string().max(100).optional(),
    maxRetries: z.number().int().min(0).max(5).optional().default(3)
        .describe("Maximum retry attempts if UI fails to render (0-5, default: 3)"),
    renderTimeout: z.number().int().min(10000).max(60000).optional().default(30000)
        .describe("Milliseconds to wait for UI render confirmation (10-60s, default: 30s)"),
});
```

**Step 2: Update CnAskUserOutputSchema**

Add retry-related fields:

```typescript
export const CnAskUserOutputSchema = z.object({
    answered: z.boolean(),
    cancelled: z.boolean(),
    timedOut: z.boolean(),
    shouldRetry: z.boolean()
        .describe("If true, the agent MUST retry this question immediately in the same session"),
    retryReason: z.string().nullable()
        .describe("Human-readable reason for retry (for debugging)"),
    renderConfirmed: z.boolean()
        .describe("Whether the UI confirmed the question was displayed"),
    answers: z.array(QuestionAnswerSchema),
});
```

**Step 3: Create schema validation test**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CnAskUserInputSchema, CnAskUserOutputSchema } from '../tools/schemas.js';

describe('CnAskUserInputSchema', () => {
  it('should accept valid input with default maxRetries', () => {
    const result = CnAskUserInputSchema.safeParse({
      questions: [{ question: 'Test?' }]
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.maxRetries, 3);
    assert.strictEqual(result.data?.renderTimeout, 30000);
  });

  it('should accept custom maxRetries and renderTimeout', () => {
    const result = CnAskUserInputSchema.safeParse({
      questions: [{ question: 'Test?' }],
      maxRetries: 5,
      renderTimeout: 15000
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.maxRetries, 5);
    assert.strictEqual(result.data?.renderTimeout, 15000);
  });

  it('should reject maxRetries > 5', () => {
    const result = CnAskUserInputSchema.safeParse({
      questions: [{ question: 'Test?' }],
      maxRetries: 10
    });
    assert.strictEqual(result.success, false);
  });
});

describe('CnAskUserOutputSchema', () => {
  it('should validate output with retry fields', () => {
    const result = CnAskUserOutputSchema.safeParse({
      answered: false,
      cancelled: false,
      timedOut: false,
      shouldRetry: true,
      retryReason: "UI render timeout",
      renderConfirmed: false,
      answers: []
    });
    assert.strictEqual(result.success, true);
  });
});
```

**Step 4: Run tests**

```bash
cd packages/mcp-server
node --test src/__tests__/schemas.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/schemas.ts
if [ -f packages/mcp-server/src/__tests__/schemas.test.ts ]; then
  git add packages/mcp-server/src/__tests__/schemas.test.ts
fi
git commit -m "feat(mcp): add retry-related fields to ask_user schemas"
```

---

## Task 2: Add Render Confirmation Tracking to PendingRequest

**Files:**
- Modify: `packages/mcp-server/src/pending.ts`
- Test: `packages/mcp-server/src/__tests__/pending.test.ts` (update existing)

**Step 1: Update PendingRequest interface**

```typescript
export interface PendingRequest {
    id: string;
    questions: any[];
    resolve: (result: PendingRequestResult) => void;
    reject: (error: Error) => void;
    createdAt: number;
    timeout: NodeJS.Timeout | null;
    // NEW FIELDS
    renderTimeout: NodeJS.Timeout | null;  // Timer for UI render confirmation
    renderConfirmed: boolean;               // Whether UI confirmed display
    maxRetries: number;                     // Max retry attempts allowed
    retryCount: number;                     // Current retry attempt number
}
```

**Step 2: Update PendingRequestResult interface**

```typescript
export interface PendingRequestResult {
    answered: boolean;
    cancelled: boolean;
    timedOut: boolean;
    // NEW FIELDS
    shouldRetry: boolean;
    retryReason: string | null;
    renderConfirmed: boolean;
    answers: QuestionAnswer[];
}
```

**Step 3: Update PendingRequestManager class**

Add new methods:

```typescript
/**
 * Mark request as having confirmed render
 */
confirmRender(id: string): boolean {
    const request = this.pending.get(id);
    if (!request) {
        return false;
    }
    
    // Clear render timeout
    if (request.renderTimeout) {
        clearTimeout(request.renderTimeout);
        request.renderTimeout = null;
    }
    
    request.renderConfirmed = true;
    return true;
}

/**
 * Check if request can be retried
 */
canRetry(id: string): boolean {
    const request = this.pending.get(id);
    if (!request) {
        return false;
    }
    return request.retryCount < request.maxRetries;
}

/**
 * Increment retry count for a request
 */
incrementRetry(id: string): boolean {
    const request = this.pending.get(id);
    if (!request) {
        return false;
    }
    request.retryCount += 1;
    return true;
}
```

**Step 4: Update resolve method**

Include new fields in resolved result:

```typescript
resolve(id: string, answers: QuestionAnswer[]): boolean {
    const request = this.pending.get(id);
    if (!request) {
        return false;
    }

    if (request.timeout) {
        clearTimeout(request.timeout);
    }
    if (request.renderTimeout) {
        clearTimeout(request.renderTimeout);
    }

    request.resolve({
        answered: true,
        cancelled: false,
        timedOut: false,
        shouldRetry: false,
        retryReason: null,
        renderConfirmed: request.renderConfirmed,
        answers
    });

    this.pending.delete(id);
    return true;
}
```

**Step 5: Update reject method**

Add retry logic:

```typescript
reject(id: string, error: Error): boolean {
    const request = this.pending.get(id);
    if (!request) {
        return false;
    }

    if (request.timeout) {
        clearTimeout(request.timeout);
    }
    if (request.renderTimeout) {
        clearTimeout(request.renderTimeout);
    }

    const isCancelled = error.message === 'cancelled';
    const isTimedOut = error.message === 'Question timeout';
    const isRenderTimeout = error.message === 'Render timeout';
    
    // Determine if we should retry
    const shouldRetry = isRenderTimeout && request.retryCount < request.maxRetries;
    const retryReason = shouldRetry 
        ? `UI failed to render question (attempt ${request.retryCount + 1}/${request.maxRetries})`
        : isRenderTimeout 
            ? `Max retries (${request.maxRetries}) exceeded`
            : null;

    request.resolve({
        answered: false,
        cancelled: isCancelled,
        timedOut: isTimedOut,
        shouldRetry,
        retryReason,
        renderConfirmed: request.renderConfirmed,
        answers: []
    });

    this.pending.delete(id);
    return true;
}
```

**Step 6: Run existing tests**

```bash
node --test packages/mcp-server/src/__tests__/pending.test.ts
```

Expected: PASS (may need test updates for new fields)

**Step 7: Commit**

```bash
git add packages/mcp-server/src/pending.ts
git commit -m "feat(mcp): add render confirmation and retry tracking to PendingRequestManager"
```

---

## Task 3: Update askUser Tool with Render Timeout Logic

**Files:**
- Modify: `packages/mcp-server/src/tools/askUser.ts`
- Test: `packages/mcp-server/src/__tests__/askUser.test.ts` (create if doesn't exist)

**Step 1: Update askUser function signature**

```typescript
export async function askUser(
    input: CnAskUserInput,
    bridge: QuestionBridge,
    pendingManager: PendingRequestManager
): Promise<CnAskUserOutput> {
```

**Step 2: Implement render timeout logic**

```typescript
export async function askUser(
    input: CnAskUserInput,
    bridge: QuestionBridge,
    pendingManager: PendingRequestManager
): Promise<CnAskUserOutput> {

    const requestId = generateRequestId();
    const maxRetries = input.maxRetries ?? 3;
    const renderTimeoutMs = input.renderTimeout ?? 30000;

    console.log(`[MCP] ask_user called: ${requestId}`, {
        questions: input.questions.length,
        title: input.title ?? null,
        maxRetries,
        renderTimeoutMs
    });

    const questionsWithIds: Array<QuestionInfo & { id: string }> = input.questions.map((q, index) => ({
        ...q,
        id: q.id || `${requestId}_${index}`
    }));

    return new Promise<CnAskUserOutput>((resolve) => {
        // Create render timeout
        const renderTimer = setTimeout(() => {
            console.log(`[MCP] Render timeout for ${requestId} - UI did not confirm display`);
            
            // Check if we can retry
            const pending = pendingManager.get(requestId);
            if (pending && pendingManager.canRetry(requestId)) {
                // Increment retry and reject with render timeout
                pendingManager.incrementRetry(requestId);
                pendingManager.reject(requestId, new Error('Render timeout'));
            } else {
                // Max retries exceeded or no pending request
                pendingManager.reject(requestId, new Error('Render timeout - max retries exceeded'));
            }
        }, renderTimeoutMs);

        pendingManager.add({
            id: requestId,
            questions: questionsWithIds,
            resolve: (result) => resolve(result),
            reject: (error) => {
                console.error(`[MCP] Request rejected: ${requestId}`, error);
                resolve({
                    answered: false,
                    cancelled: error.message === 'cancelled',
                    timedOut: error.message === 'Question timeout',
                    shouldRetry: error.message === 'Render timeout',
                    retryReason: error.message === 'Render timeout' 
                        ? 'UI failed to render question within timeout'
                        : null,
                    renderConfirmed: false,
                    answers: []
                });
            },
            createdAt: Date.now(),
            timeout: null,  // Will be set after render confirmation
            renderTimeout: renderTimer,
            renderConfirmed: false,
            maxRetries,
            retryCount: 0
        });

        // Send question to bridge
        bridge.sendQuestion(requestId, questionsWithIds, input.title);
    });
}
```

**Step 3: Update QuestionBridge interface**

Add method for render confirmation:

```typescript
export interface QuestionBridge {
    sendQuestion(requestId: string, questions: Array<QuestionInfo & { id: string }>, title?: string): void;
    onAnswer(callback: (requestId: string, answers: any[]) => void): void;
    onCancel(callback: (requestId: string) => void): void;
    onRenderConfirmed(callback: (requestId: string) => void): void;  // NEW
}
```

**Step 4: Create test file**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { askUser, type QuestionBridge } from '../tools/askUser.js';
import { PendingRequestManager } from '../pending.js';

describe('askUser', () => {
  it('should return shouldRetry=true on render timeout', async () => {
    const manager = new PendingRequestManager();
    const bridge: QuestionBridge = {
      sendQuestion: () => {},  // Never confirms render
      onAnswer: () => {},
      onCancel: () => {},
      onRenderConfirmed: () => {}
    };

    const result = await askUser({
      questions: [{ question: 'Test?' }],
      renderTimeout: 300  // Fast timeout for testing
    }, bridge, manager);

    assert.strictEqual(result.shouldRetry, true);
    assert.strictEqual(result.renderConfirmed, false);
    assert.ok(result.retryReason?.includes('UI failed to render'));
  });

  it('should return shouldRetry=false after max retries', async () => {
    const manager = new PendingRequestManager();
    const bridge: QuestionBridge = {
      sendQuestion: () => {},
      onAnswer: () => {},
      onCancel: () => {},
      onRenderConfirmed: () => {}
    };

    // First attempt - should retry
    const result1 = await askUser({
      questions: [{ question: 'Test?' }],
      maxRetries: 1,
      renderTimeout: 50
    }, bridge, manager);
    assert.strictEqual(result1.shouldRetry, true);

    // Second attempt - max retries exceeded
    const result2 = await askUser({
      questions: [{ question: 'Test?' }],
      maxRetries: 1,
      renderTimeout: 50
    }, bridge, manager);
    assert.strictEqual(result2.shouldRetry, false);
    assert.ok(result2.retryReason?.includes('Max retries'));
  });
});
```

**Step 5: Run tests**

```bash
node --test packages/mcp-server/src/__tests__/askUser.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/mcp-server/src/tools/askUser.ts
if [ -f packages/mcp-server/src/__tests__/askUser.test.ts ]; then
  git add packages/mcp-server/src/__tests__/askUser.test.ts
fi
git commit -m "feat(mcp): implement render timeout and retry logic in askUser tool"
```

---

## Task 4: Update Server Tool Schema Description

**Files:**
- Modify: `packages/mcp-server/src/server.ts` (lines 125-158)

**Step 1: Update getAskUserToolSchema method**

Update the description and add proper instruction to the agent:

```typescript
private getAskUserToolSchema() {
    return {
        name: "ask_user",
        description: `Ask the user questions through CodeNomad's interface. 

IMPORTANT INSTRUCTIONS FOR AI AGENT:
1. This tool blocks until the user responds or a timeout occurs.
2. If the response has shouldRetry=true, you MUST retry calling this tool immediately with the same parameters.
3. If shouldRetry=false and timedOut=true, inform the user the question timed out and ask if they want to continue.
4. If shouldRetry=false and max retries were exceeded, inform the user there was a technical issue displaying the question.

The tool will automatically retry up to 3 times if the UI fails to render the question. You only need to retry when shouldRetry=true is returned.`,
        inputSchema: {
            type: "object",
            properties: {
                questions: {
                    type: "array",
                    description: "Array of questions to ask user",
                    items: {
                        type: "object",
                        properties: {
                            question: { type: "string" },
                            type: { type: "string", enum: ["text", "select", "multi-select", "confirm"] },
                            options: { type: "array", items: { type: "string" } },
                            required: { type: "boolean" },
                            placeholder: { type: "string" }
                        },
                        required: ["question"]
                    },
                    minItems: 1,
                    maxItems: 10
                },
                title: {
                    type: "string",
                    description: "Optional title for question dialog",
                    maxLength: 100
                },
                maxRetries: {
                    type: "integer",
                    description: "Maximum retry attempts if UI fails to render (0-5, default: 3)",
                    minimum: 0,
                    maximum: 5,
                    default: 3
                },
                renderTimeout: {
                    type: "integer",
                    description: "Milliseconds to wait for UI render confirmation (10000-60000, default: 30000)",
                    minimum: 10000,
                    maximum: 60000,
                    default: 30000
                }
            },
            required: ["questions"]
        }
    };
}
```

**Step 2: Commit**

```bash
git add packages/mcp-server/src/server.ts
git commit -m "docs(mcp): update ask_user tool description with retry instructions for agents"
```

---

## Task 5: Update IPC Bridge for Render Confirmation

**Files:**
- Modify: `packages/mcp-server/src/bridge/ipc.ts`
- Modify: `packages/mcp-server/src/bridge/renderer.ts` (if exists)
- Modify: `packages/ui/src/lib/mcp-bridge.ts`

**Step 1: Add render confirmation IPC handler in ipc.ts**

Add to setupMcpBridge function:

```typescript
// Handler: UI confirms question was rendered/displayed
ipcMain.on('mcp:renderConfirmed', (_event: any, data: any) => {
    const { requestId } = data;
    console.log(`[MCP IPC] Received render confirmation from UI: ${requestId}`);
    emitRendererLog(mainWindow, 'info', 'Received render confirmation from UI', { requestId });

    if (globalPendingManager) {
        const confirmed = globalPendingManager.confirmRender(requestId);
        if (confirmed) {
            console.log(`[MCP IPC] Render confirmed for ${requestId}, starting user response timer`);
            emitRendererLog(mainWindow, 'info', 'Render confirmed, starting user response timer', { requestId });
            
            // Start the 5-minute user response timeout
            const pending = globalPendingManager.get(requestId);
            if (pending) {
                pending.timeout = setTimeout(() => {
                    console.log(`[MCP IPC] User response timeout for ${requestId}`);
                    globalPendingManager?.reject(requestId, new Error('Question timeout'));
                }, 300000); // 5 minutes
            }
        } else {
            console.warn(`[MCP IPC] No pending request for render confirmation: ${requestId}`);
            emitRendererLog(mainWindow, 'warn', 'No pending request for render confirmation', { requestId });
        }
    } else {
        console.warn('[MCP IPC] Pending manager not initialized, cannot process render confirmation');
        emitRendererLog(mainWindow, 'warn', 'Pending manager not initialized');
    }
});
```

**Step 2: Update createIpcBridge to include onRenderConfirmed**

```typescript
export function createIpcBridge(mainWindow: BrowserWindow, pendingManager: PendingRequestManager): QuestionBridge {
    // ... existing code ...
    
    return {
        sendQuestion: (requestId, questions, title) => {
            // ... existing code ...
        },
        onAnswer: (callback) => {
            // Already handled
        },
        onCancel: (callback) => {
            // Already handled
        },
        onRenderConfirmed: (callback) => {
            // Handled via 'mcp:renderConfirmed' IPC handler above
            console.log('[MCP IPC] Render confirmation handler registered (via IPC)');
        }
    };
}
```

**Step 3: Update UI bridge to send render confirmation**

In `packages/ui/src/lib/mcp-bridge.ts`, after question is displayed:

Find the section where the question is added to the queue (around line 193) and add:

```typescript
// After adding question to queue, send render confirmation back to MCP
if (isElectronEnvironment()) {
    setTimeout(() => {
        const electronAPI = (window as any).electronAPI;
        electronAPI.mcpSend('mcp:renderConfirmed', { 
            requestId,
            timestamp: Date.now()
        });
        if (import.meta.env.DEV) {
            console.log(`[MCP Bridge UI] Sent render confirmation for ${requestId}`);
        }
    }, 100); // Small delay to ensure UI actually rendered
}
```

**Step 4: Commit**

```bash
git add packages/mcp-server/src/bridge/ipc.ts
git add packages/ui/src/lib/mcp-bridge.ts
git commit -m "feat(mcp): implement render confirmation IPC between UI and MCP server"
```

---

## Task 6: Update UI Auto-Open Logic with Retry Awareness

**Files:**
- Modify: `packages/ui/src/components/instance/instance-shell2.tsx`

**Step 1: Enhance question wizard auto-open with retry tracking**

Around line 232-257, update the createEffect to track retry attempts:

```typescript
// Auto-open question wizard when a pending question appears (unless minimized)
createEffect(() => {
  const pending = getPendingQuestion(props.instance.id)
  if (import.meta.env.DEV) {
    console.log('[Instance Shell] createEffect check:', {
      instanceId: props.instance.id,
      pendingQuestionId: pending?.id ?? null,
      minimized: questionWizardMinimized(),
      willOpen: !!(pending && !questionWizardMinimized())
    })
  }
  if (pending && !questionWizardMinimized()) {
    // Auto-open only if user hasn't minimized
    if (import.meta.env.DEV) {
      console.log('[Instance Shell] Opening question wizard for:', pending.id)
    }
    setQuestionWizardOpen(true)
    
    // Send render confirmation to MCP server
    if (isElectronEnvironment() && pending.source === 'mcp') {
      const electronAPI = (window as any).electronAPI;
      electronAPI.mcpSend('mcp:renderConfirmed', { 
        requestId: pending.id,
        timestamp: Date.now()
      });
    }
  } else if (!pending) {
    // Reset states when no pending questions
    if (import.meta.env.DEV) {
      console.log('[Instance Shell] No pending question, closing wizard')
    }
    setQuestionWizardOpen(false)
    setQuestionWizardMinimized(false)
  }
})
```

**Step 2: Add strong notification for retried questions**

Add helper function:

```typescript
const showRetryNotification = (questionId: string, attemptNumber: number) => {
  showToastNotification({
    title: attemptNumber > 1 ? 'Question Retry' : 'Question Received',
    message: attemptNumber > 1 
      ? `Previous attempt failed to display. This is retry attempt ${attemptNumber}.`
      : 'Please answer the question to continue.',
    variant: attemptNumber > 1 ? 'warning' : 'info',
    duration: 15000,  // Longer duration for retries
  });
};
```

**Step 3: Commit**

```bash
git add packages/ui/src/components/instance/instance-shell2.tsx
git commit -m "feat(ui): enhance question wizard with render confirmation and retry notifications"
```

---

## Task 7: Update AGENTS.md with Retry Instruction

**Files:**
- Modify: `/Users/muhammadfaiz/Custom APP/CodeNomad/AGENTS.md`

**Step 1: Add retry instruction section**

After line 15 ("NO EXCEPTIONS..."), add:

```markdown
## ask_user Tool Retry Behavior

**When ask_user returns `shouldRetry: true`:**
1. **IMMEDIATELY retry** the ask_user tool call with the SAME parameters
2. Do NOT summarize, end the session, or ask the user what happened
3. This is an automatic UI recovery mechanism - the question failed to display
4. The retry happens within the same session (no premium request cost)

**When ask_user returns `shouldRetry: false` and `timedOut: true`:**
1. The user did not respond within 5 minutes
2. Ask the user if they want to continue or if they missed the question
3. You may re-ask the question if the user confirms they want to continue

**When ask_user returns `shouldRetry: false` with error:**
1. Maximum retry attempts (3) have been exceeded
2. Inform the user: "There was a technical issue displaying the question. Please try again."
3. Ask if they want to continue with the task
```

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add ask_user retry behavior instructions for agents"
```

---

## Task 8: Integration Testing

**Files:**
- Create: `packages/mcp-server/src/__tests__/integration-retry.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { CodeNomadMcpServer } from '../server.js';
import { PendingRequestManager } from '../pending.js';

describe('ask_user retry integration', () => {
  let server: CodeNomadMcpServer;
  let pendingManager: PendingRequestManager;

  beforeEach(() => {
    pendingManager = new PendingRequestManager();
    server = new CodeNomadMcpServer();
    // Mock bridge that never confirms render
    (server as any).bridge = {
      sendQuestion: () => {},
      onAnswer: () => {},
      onCancel: () => {},
      onRenderConfirmed: () => {}
    };
    (server as any).pendingManager = pendingManager;
  });

  it('should retry 3 times then give up', async () => {
    const results = [];
    
    // Simulate 4 attempts (3 retries + 1 final failure)
    for (let i = 0; i < 4; i++) {
      const result = await (server as any).handleToolsCall(1, {
        name: 'ask_user',
        arguments: {
          questions: [{ question: 'Test?' }],
          maxRetries: 3,
          renderTimeout: 300
        }
      });
      
      const parsedResult = JSON.parse(result.result.content[0].text);
      results.push(parsedResult);
    }

    // First 3 should request retry
    assert.strictEqual(results[0].shouldRetry, true);
    assert.strictEqual(results[1].shouldRetry, true);
    assert.strictEqual(results[2].shouldRetry, true);
    
    // 4th should not retry (max exceeded)
    assert.strictEqual(results[3].shouldRetry, false);
  });

  it('should succeed on first try if render confirmed', async () => {
    // This test requires a mock that confirms render
    // Implementation depends on how you want to mock the IPC
  });
});
```

**Step 2: Run tests**

```bash
node --test packages/mcp-server/src/__tests__/integration-retry.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add packages/mcp-server/src/__tests__/integration-retry.test.ts
git commit -m "test(mcp): add integration tests for ask_user retry mechanism"
```

---

## Task 9: End-to-End Testing

**Manual testing steps:**

1. **Start the application**
   ```bash
   npm run dev
   ```

2. **Test normal flow:**
   - Ask agent to use ask_user tool
   - Verify question appears immediately
   - Verify render confirmation is sent
   - Answer question
   - Verify success response with `shouldRetry: false`

3. **Test render timeout (simulate):**
   - Block UI from rendering (e.g., breakpoint or delay)
   - Verify `shouldRetry: true` returned after 30s
   - Verify agent retries automatically
   - Verify toast notification shows retry attempt

4. **Test max retries exceeded:**
   - Prevent UI from rendering completely
   - Verify 3 retry attempts occur
   - Verify final response has `shouldRetry: false` with error

5. **Verify no premium requests:**
   - Check logs for "MCP TOOL INVOKED: ask_user (ZERO-COST)"
   - Verify retries don't trigger new LLM calls

**Step 1: Document test results**

Create `docs/testing/ask_user_retry_tests.md` with test results.

**Step 2: Commit**

```bash
git add docs/testing/ask_user_retry_tests.md
git commit -m "docs: add end-to-end testing documentation for ask_user retry"
```

---

## Summary

This implementation adds:

1. **Render confirmation** - UI must confirm display within 30s
2. **Automatic retry** - Up to 3 retries if UI fails to render
3. **Clear agent instructions** - Tool schema tells agent when to retry
4. **No premium cost** - Retries happen within same session
5. **Distinguish failure types** - UI failure vs user timeout
6. **Strong notifications** - Users are alerted on retries

The system ensures questions are reliably delivered to users without consuming additional premium requests on retry attempts.

---

**Execution choice:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task
2. **Parallel Session (separate)** - Open new session with executing-plans

Which approach would you prefer?
