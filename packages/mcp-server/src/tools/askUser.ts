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

    console.log(`[MCP] ask_user called: ${requestId}`, {
        questions: input.questions.length,
        title: input.title ?? null
    });

    // Generate IDs for questions if not provided
    const questionsWithIds: Array<QuestionInfo & { id: string }> = input.questions.map((q, index) => ({
        ...q,
        id: q.id || `${requestId}_${index}`
    }));

    // Create Promise that blocks until response
    return new Promise<CnAskUserOutput>((resolve) => {
        // Add to pending manager
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
                    answers: []
                });
            },
            createdAt: Date.now(),
            timeout: null // We handle timeout in pending manager
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
}
