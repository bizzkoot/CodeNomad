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
 * Store cleanup functions per instance to prevent listener accumulation
 */
const cleanupFunctions = new Map<string, () => void>();

/**
 * Track processed questions to prevent duplicates from multiple handlers
 */
const processedQuestions = new Set<string>();

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
    // Prevent multiple initializations for same instance
    if (cleanupFunctions.has(instanceId)) {
        console.log(`[MCP Bridge UI] Already initialized for instance: ${instanceId}, skipping`);
        return;
    }

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
        const cleanup = electronAPI.mcpOn('ask_user.asked', (payload: any) => {
            const { requestId, questions, title, source } = payload;
            
            // Deduplicate at bridge layer to prevent race conditions
            if (processedQuestions.has(requestId)) {
                console.log('[MCP Bridge UI] Ignoring duplicate question:', requestId);
                return;
            }
            processedQuestions.add(requestId);
            
            console.log('[MCP Bridge UI] Received question:', payload);

            // Map MCP question format to CodeNomad question format
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
        
        // Store cleanup function for this instance
        cleanupFunctions.set(instanceId, cleanup);

        console.log('[MCP Bridge UI] Initialized successfully');
    } catch (error) {
        console.error('[MCP Bridge UI] Failed to initialize:', error);
    }
}

/**
 * Cleanup MCP bridge for an instance (removes listeners)
 */
export function cleanupMcpBridge(instanceId: string): void {
    const cleanup = cleanupFunctions.get(instanceId);
    if (cleanup) {
        console.log(`[MCP Bridge UI] Cleaning up MCP bridge for instance: ${instanceId}`);
        cleanup(); // Call the cleanup function returned by mcpOn
        cleanupFunctions.delete(instanceId);
    }
}

/**
 * Clear processed question from deduplication set (call after answer/cancel)
 */
export function clearProcessedQuestion(requestId: string): void {
    processedQuestions.delete(requestId);
}
