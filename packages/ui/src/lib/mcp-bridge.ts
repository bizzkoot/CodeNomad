import type { QuestionAnswer } from '../types/question.js';

/**
 * Check if we're in Electron environment
 */
function isElectronEnvironment(): boolean {
    try {
        return typeof window !== 'undefined' && !!(window as any).require;
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
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('mcp:answer', { requestId, answers });
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
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('mcp:cancel', { requestId });
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
    console.log(`[MCP Bridge UI] Initializing for instance: ${instanceId}`);

    if (!isElectronEnvironment()) {
        console.warn('[MCP Bridge UI] Not in Electron environment, skipping MCP bridge');
        return;
    }

    try {
        const { ipcRenderer } = (window as any).require('electron');

        console.log('[MCP Bridge UI] Setting up IPC listeners');

        // Listen for questions from MCP server (via main process)
        ipcRenderer.on('cn_ask_user.asked', (_event: any, payload: any) => {
            console.log('[MCP Bridge UI] Received question:', payload);

            // Map MCP question format to CodeNomad question format
            const { requestId, questions, title, source } = payload;

            // Add to question queue with MCP source
            // Import addQuestionToQueue from stores/questions
            const { addQuestionToQueueWithSource } = require('../stores/questions.js');
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
                })),
                source: source || 'mcp'
            });
        });

        console.log('[MCP Bridge UI] Initialized successfully');
    } catch (error) {
        console.error('[MCP Bridge UI] Failed to initialize:', error);
    }
}
