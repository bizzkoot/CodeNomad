import type { QuestionAnswer } from '../types/question.js';
import { addQuestionToQueueWithSource, handleQuestionFailure } from '../stores/questions.js';
import { activeInstanceId, instances } from '../stores/instances';
import { showToastNotification } from './notifications';

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
 * Track which instance a request belongs to
 */
const requestInstanceMap = new Map<string, string>();

/**
 * Track retry attempts for timed-out requests
 */
const retryAttempts = new Map<string, number>();

/**
 * Store original question payloads for retry capability
 */
const questionPayloads = new Map<string, any>();
const notifiedQuestionRequests = new Set<string>();

/**
 * Send answer to main process (for MCP questions)
 */
export function sendMcpAnswer(requestId: string, answers: QuestionAnswer[]): void {
            if (import.meta.env.DEV) {
                console.log(`[MCP Bridge UI] Sending answer: ${requestId}`);
            }

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
            if (import.meta.env.DEV) {
                console.log(`[MCP Bridge UI] Sending cancel: ${requestId}`);
            }

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
        if (import.meta.env.DEV) {
            console.log(`[MCP Bridge UI] Already initialized for instance: ${instanceId}, skipping`);
        }
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

    if (import.meta.env.DEV) {
        console.log(`[MCP Bridge UI] Initializing for instance: ${instanceId}`);
    }

    if (!isElectronEnvironment()) {
        console.warn('[MCP Bridge UI] Not in Electron environment, skipping MCP bridge');
        return;
    }

    try {
        const electronAPI = (window as any).electronAPI;

        if (import.meta.env.DEV) {
            console.log('[MCP Bridge UI] Setting up IPC listeners');
        }

        // Listen for questions from MCP server (via main process)
        const cleanup = electronAPI.mcpOn('ask_user.asked', (payload: any) => {
            const { requestId, questions, source } = payload;

            // Deduplicate at bridge layer to prevent race conditions
            if (processedQuestions.has(requestId)) {
                if (import.meta.env.DEV) {
                    console.log('[MCP Bridge UI] Ignoring duplicate question:', requestId);
                }
                return;
            }
            processedQuestions.add(requestId);

            // Store payload for potential retry
            questionPayloads.set(requestId, payload);

            const activeId = activeInstanceId();
            const targetInstanceId = activeId ?? instanceId;
            requestInstanceMap.set(requestId, targetInstanceId);

            if (import.meta.env.DEV) {
                console.log('[MCP Bridge UI] Received question:', payload, 'for instance:', targetInstanceId);
            }

            if (activeId && activeId !== instanceId && !notifiedQuestionRequests.has(requestId)) {
                const instance = instances().get(instanceId);
                const instanceName = instance?.folder ?? instanceId;
                showToastNotification({
                    title: 'Question received',
                    message: `A question arrived for ${instanceName}. Open that workspace to answer.`,
                    variant: 'warning',
                    duration: 12000,
                });
                notifiedQuestionRequests.add(requestId);
            }

            // Map MCP question format to CodeNomad question format
            // Add to question queue with MCP source
            addQuestionToQueueWithSource(targetInstanceId, {
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

        // Listen for question rejections from MCP server (timeout, cancel, session-stop)
        const cleanupRejected = electronAPI.mcpOn('ask_user.rejected', (payload: any) => {
            const { requestId, timedOut, cancelled, reason } = payload;
            if (import.meta.env.DEV) {
                console.log('[MCP Bridge UI] Received question rejection:', payload);
            }

            // Check if this is a timeout and we haven't retried yet
            const currentRetries = retryAttempts.get(requestId) ?? 0;
            if (timedOut && currentRetries < 1) {
                // Retry once: route to active instance again
                retryAttempts.set(requestId, currentRetries + 1);
                
                const storedPayload = questionPayloads.get(requestId);
                if (storedPayload) {
                    if (import.meta.env.DEV) {
                        console.log(`[MCP Bridge UI] Retrying timed-out question ${requestId} (attempt ${currentRetries + 1}/1)`);
                    }

                    // Clear from processed set to allow re-processing
                    processedQuestions.delete(requestId);
                    
                    // Re-route to active instance
                    const activeId = activeInstanceId();
                    if (activeId) {
                        const { questions, source } = storedPayload;
                        
                        // Update target instance for this request
                        requestInstanceMap.set(requestId, activeId);
                        
                        if (import.meta.env.DEV) {
                            console.log(`[MCP Bridge UI] Routing retry to active instance: ${activeId}`);
                        }

                        // Re-add to question queue
                        addQuestionToQueueWithSource(activeId, {
                            id: requestId,
                            questions: questions.map((q: any) => ({
                                id: q.id,
                                question: q.question,
                                header: q.question.substring(0, 12) + '...',
                                options: q.options ? q.options.map((opt: string) => ({
                                    label: opt,
                                    description: opt
                                })) : [],
                                multiple: q.type === 'multi-select'
                            }))
                        }, source || 'mcp');

                        // Re-add to processed set
                        processedQuestions.add(requestId);
                        
                        // Show toast to notify user
                        showToastNotification({
                            title: 'Question retried',
                            message: 'The question timed out and has been routed to your active workspace.',
                            variant: 'info',
                            duration: 8000,
                        });
                        
                        return; // Don't proceed with failure handling
                    }
                }
            }

            // Clear from processed questions set
            processedQuestions.delete(requestId);

            const targetInstanceId = requestInstanceMap.get(requestId) ?? activeInstanceId() ?? instanceId;
            requestInstanceMap.delete(requestId);

            // Determine failure reason
            let failureReason: 'timeout' | 'cancelled' | 'session-stop' = 'session-stop';
            if (timedOut) {
                failureReason = 'timeout';
            } else if (cancelled) {
                failureReason = 'cancelled';
            } else if (reason === 'session-stop') {
                failureReason = 'session-stop';
            }

            // Get instance folder path for persistent storage
            const instance = instances().get(targetInstanceId);
            const folderPath = instance?.folder ?? '';

            // Move question to failed notifications
            handleQuestionFailure(targetInstanceId, requestId, failureReason, folderPath);
        });

        // Store cleanup function for this instance (combines both listeners)
        const originalCleanup = cleanup;
        cleanupFunctions.set(instanceId, () => {
            originalCleanup();
            cleanupRejected();
        });

        if (import.meta.env.DEV) {
            console.log('[MCP Bridge UI] Initialized successfully');
        }
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
        if (import.meta.env.DEV) {
            console.log(`[MCP Bridge UI] Cleaning up MCP bridge for instance: ${instanceId}`);
        }
        cleanup(); // Call the cleanup function returned by mcpOn
        cleanupFunctions.delete(instanceId);
    }
}

/**
 * Clear processed question from deduplication set (call after answer/cancel)
 */
export function clearProcessedQuestion(requestId: string): void {
    processedQuestions.delete(requestId);
    requestInstanceMap.delete(requestId);
    notifiedQuestionRequests.delete(requestId);
    retryAttempts.delete(requestId);
    questionPayloads.delete(requestId);
}
