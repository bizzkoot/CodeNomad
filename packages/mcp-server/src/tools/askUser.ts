import type { CnAskUserInput, CnAskUserOutput, QuestionInfo } from './schemas.js';
import type { PendingRequestManager } from '../pending.js';

export function generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Main ask_user tool implementation
 * Blocks until user responds or timeout/cancellation
 */
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

    // Generate IDs for questions if not provided
    const questionsWithIds: Array<QuestionInfo & { id: string }> = input.questions.map((q, index) => ({
        ...q,
        id: q.id || `${requestId}_${index}`
    }));

    // Create Promise that blocks until response
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

        // Add to pending manager
        pendingManager.add({
            id: requestId,
            questions: questionsWithIds,
            resolve: (result) => resolve(result),
            reject: (error) => {
                console.error(`[MCP] Request rejected: ${requestId}`, error);
                const isRenderTimeout = error.message.includes('Render timeout');
                resolve({
                    answered: false,
                    cancelled: error.message === 'cancelled',
                    timedOut: error.message === 'Question timeout',
                    shouldRetry: isRenderTimeout && !error.message.includes('max retries'),
                    retryReason: isRenderTimeout 
                        ? error.message.includes('max retries')
                            ? `Max retries (${maxRetries}) exceeded`
                            : 'UI failed to render question within timeout'
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

/**
 * Bridge interface for communicating with UI
 */
export interface QuestionBridge {
    sendQuestion(requestId: string, questions: Array<QuestionInfo & { id: string }>, title?: string): void;
    onAnswer(callback: (requestId: string, answers: any[]) => void): void;
    onCancel(callback: (requestId: string) => void): void;
    onRenderConfirmed(callback: (requestId: string) => void): void;  // NEW
}
