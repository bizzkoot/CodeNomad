import type { QuestionAnswer } from '../types/question.js';
import { addQuestionToQueueWithSource } from '../stores/questions.js';

/**
 * Check if we're in Electron environment
 */
function isElectronEnvironment(): boolean {
    try {
        return typeof window !== 'undefined' && !!(window as any).electronAPI;
    } catch {
        return false;
    }
}

/**
 * Send answer to main process (for MCP questions)
 */
export function sendMcpAnswer(requestId: string, answers: QuestionAnswer[]): void {
    console.log(`[MCP Bridge UI] Sending answer: ${requestId}`);

    try {
        if (isElectronEnvironment()) {
            (window as any).electronAPI.mcpSend('mcp:answer', { requestId, answers });
        } else {
            console.warn('[MCP Bridge UI] Not in Electron environment, cannot send answer');
        }
    } catch (error) {
        console.error('[MCP Bridge UI] Failed to send answer:', error);
    }
}

/**
 * Send cancel to main process (for MCP questions)
 */
export function sendMcpCancel(requestId: string): void {
    console.log(`[MCP Bridge UI] Sending cancel: ${requestId}`);

    try {
        if (isElectronEnvironment()) {
            (window as any).electronAPI.mcpSend('mcp:cancel', { requestId });
        } else {
            console.warn('[MCP Bridge UI] Not in Electron environment, cannot send cancel');
        }
    } catch (error) {
        console.error('[MCP Bridge UI] Failed to send cancel:', error);
    }
}

/**
 * Initialize MCP bridge in renderer
 */
export function initMcpBridge(instanceId: string): void {
    // Send IPC message to main process for debugging (will show in terminal)
    try {
        if (isElectronEnvironment()) {
            (window as any).electronAPI.mcpSend('mcp:debug', { message: '[MCP Bridge UI] initMcpBridge called', instanceId });
        }
    } catch (e) {
        // Ignore if electron not available yet
    }

    console.log(`[MCP Bridge UI] Initializing for instance: ${instanceId}`);

    if (!isElectronEnvironment()) {
        console.warn('[MCP Bridge UI] Not in Electron environment, skipping MCP bridge');
        return;
    }

    try {
        const electronAPI = (window as any).electronAPI;

        console.log('[MCP Bridge UI] Setting up IPC listeners');

        // Listen for questions from MCP server (via main process)
        electronAPI.mcpOn('ask_user.asked', (payload: any) => {
            console.log('[MCP Bridge UI] Received question:', payload);

            // Map MCP question format to CodeNomad question format
            const { requestId, questions, title, source } = payload;

            // Add to question queue with MCP source
            addQuestionToQueueWithSource(instanceId, {
                id: requestId,
                questions: questions.map((q: any) => ({
                    id: q.id,
                    question: q.question,
                    header: q.question.substring(0, 12) + '...', // Use first 12 chars as header
                    options: q.options ? q.options.map((opt: string) => ({
                        label: opt,
                        description: opt
                    })) : [],
                    multiple: q.type === 'multi-select'
                }))
            }, source || 'mcp');
        });

        console.log('[MCP Bridge UI] Initialized successfully');
    } catch (error) {
        console.error('[MCP Bridge UI] Failed to initialize:', error);
    }
}
