import type { QuestionAnswer } from '../types/question.js';
import { addQuestionToQueueWithSource, handleQuestionFailure } from '../stores/questions.js';
import { activeInstanceId, instances } from '../stores/instances';
import { preferences } from '../stores/preferences';
import { createEffect } from 'solid-js';
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
 * Track instances with initialized bridge (persists across remount cleanup)
 */
const initializedInstances = new Set<string>();

/**
 * Store cleanup functions per instance to prevent listener accumulation
 */
const cleanupFunctions = new Map<string, () => void>();

/**
 * Track active listeners per channel to prevent duplicates
 */
// const activeListeners = new Map<string, () => void>();

/**
 * Track processed questions to prevent duplicates from multiple handlers
 */
const processedQuestionsByInstance = new Map<string, Set<string>>();

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
let mcpLogListenerAttached = false;

function getProcessedQuestions(instanceId: string): Set<string> {
    const existing = processedQuestionsByInstance.get(instanceId);
    if (existing) return existing;
    const next = new Set<string>();
    processedQuestionsByInstance.set(instanceId, next);
    return next;
}

function markQuestionProcessed(instanceId: string, requestId: string): void {
    getProcessedQuestions(instanceId).add(requestId);
    requestInstanceMap.set(requestId, instanceId);
}

function isQuestionProcessed(instanceId: string, requestId: string): boolean {
    return getProcessedQuestions(instanceId).has(requestId);
}

// function ensureSingleListener(channel: string, handler: (payload: any) => void): () => void {
//     const existingCleanup = activeListeners.get(channel);
//     if (existingCleanup) {
//         if (import.meta.env.DEV) {
//             console.log(`[MCP Bridge UI] Removing existing listener for ${channel}`);
//         }
//         existingCleanup();
//         activeListeners.delete(channel);
//     }
// 
//     const electronAPI = (window as any).electronAPI;
//     const cleanup = electronAPI.mcpOn(channel, handler);
//     activeListeners.set(channel, cleanup);
// 
//     return () => {
//         cleanup();
//         activeListeners.delete(channel);
//     };
// }

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
 * Send configuration update to main process
 */
export function sendMcpConfig(config: { requestTimeout?: number }): void {
    if (import.meta.env.DEV) {
        console.log(`[MCP Bridge UI] Sending config update:`, config);
    }

    try {
        if (isElectronEnvironment()) {
            (window as any).electronAPI.mcpSend('mcp:config', config);
        }
    } catch (error) {
        console.error('[MCP Bridge UI] Failed to send config:', error);
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

export function isMcpBridgeInitialized(instanceId: string): boolean {
    return initializedInstances.has(instanceId) && cleanupFunctions.has(instanceId);
}

/**
 * Initialize MCP bridge in renderer
 */
export function initMcpBridge(instanceId: string): void {
    // Prevent multiple initializations for same instance
    if (initializedInstances.has(instanceId)) {
        if (cleanupFunctions.has(instanceId)) {
            if (import.meta.env.DEV) {
                console.log(`[MCP Bridge UI] Already initialized for instance: ${instanceId}, skipping`);
            }
            return;
        }
        if (import.meta.env.DEV) {
            console.log(`[MCP Bridge UI] Initialized without listeners for instance: ${instanceId}, reinitializing`);
        }
    }

    // Send IPC message to main process for debugging (will show in terminal)
    try {
        if (isElectronEnvironment()) {
            (window as any).electronAPI.mcpSend('mcp:debug', {
                message: '[MCP Bridge UI] initMcpBridge called',
                instanceId,
                locationHref: typeof window !== 'undefined' ? window.location.href : 'unknown'
            });
        }
    } catch {
        // Ignore if electron not available yet
    }

    if (import.meta.env.DEV) {
        console.log(`[MCP Bridge UI] Initializing for instance: ${instanceId}`);
    }

    if (!isElectronEnvironment()) {
        console.warn('[MCP Bridge UI] Not in Electron environment, skipping MCP bridge');
        return;
    }

    initializedInstances.add(instanceId);

    const existingCleanup = cleanupFunctions.get(instanceId);
    if (existingCleanup) {
        if (import.meta.env.DEV) {
            console.log(`[MCP Bridge UI] Found existing cleanup for instance: ${instanceId}, cleaning up first`);
        }
        existingCleanup();
        cleanupFunctions.delete(instanceId);
    }

    try {
        const electronAPI = (window as any).electronAPI;

        if (!mcpLogListenerAttached) {
            mcpLogListenerAttached = true;
            electronAPI.mcpOn('mcp:log', (payload: any) => {
                const { level, message, data } = payload ?? {};
                const logMethod = level === 'error'
                    ? console.error
                    : level === 'warn'
                        ? console.warn
                        : console.log;
                if (data !== undefined) {
                    logMethod(`[MCP Main] ${message}`, data);
                } else {
                    logMethod(`[MCP Main] ${message}`);
                }
            });
        }

        if (import.meta.env.DEV) {
            console.log('[MCP Bridge UI] Setting up IPC listeners');
        }

        // Send initial config
        sendMcpConfig({ requestTimeout: preferences().askUserTimeout });

        // Watch for changes (this runs in the reactive context of the component calling initMcpBridge)
        createEffect(() => {
            const timeout = preferences().askUserTimeout;
            sendMcpConfig({ requestTimeout: timeout });
        });


        // Send initial config
        sendMcpConfig({ requestTimeout: preferences().askUserTimeout });

        // Watch for changes (this runs in the reactive context of the component calling initMcpBridge)
        createEffect(() => {
            const timeout = preferences().askUserTimeout;
            sendMcpConfig({ requestTimeout: timeout });
        });

        // Listen for questions from MCP server (via main process)
        // const electronAPI = (window as any).electronAPI; // Already defined above
        const cleanup = electronAPI.mcpOn('ask_user.asked', (payload: any) => {
            const { requestId, questions, source } = payload;
            if (import.meta.env.DEV) {
                console.log('[MCP Bridge UI] ask_user.asked received in renderer', {
                    requestId,
                    source: source || 'mcp',
                    locationHref: typeof window !== 'undefined' ? window.location.href : 'unknown'
                });
            }

            // Store payload for potential retry
            questionPayloads.set(requestId, payload);

            const activeId = activeInstanceId();
            const targetInstanceId = activeId ?? instanceId;

            // Deduplicate at bridge layer to prevent race conditions
            if (isQuestionProcessed(targetInstanceId, requestId)) {
                if (import.meta.env.DEV) {
                    console.log('[MCP Bridge UI] Ignoring duplicate question:', requestId);
                }
                return;
            }
            markQuestionProcessed(targetInstanceId, requestId);

            if (import.meta.env.DEV) {
                console.log('[📥 MCP QUESTION RECEIVED]', {
                    requestId,
                    source: source || 'mcp',
                    targetInstanceId,
                    questionCount: questions.length,
                    timestamp: new Date().toISOString()
                });
                console.log('[MCP Bridge UI] Full payload:', payload);
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
            // Fallback render confirmation for cases where the wizard mount is delayed
            if (isElectronEnvironment() && (source || 'mcp') === 'mcp') {
                setTimeout(() => {
                    const electronAPI = (window as any).electronAPI;
                    electronAPI.mcpSend('mcp:renderConfirmed', {
                        requestId,
                        timestamp: Date.now()
                    });
                    if (import.meta.env.DEV) {
                        console.log(`[MCP Bridge UI] Sent render confirmation fallback for ${requestId}`);
                    }
                }, 100);
            }
        });

        // Listen for question rejections from MCP server (timeout, cancel, session-stop)
        const cleanupRejected = electronAPI.mcpOn('ask_user.rejected', (payload: any) => {
            const { requestId, timedOut, cancelled, reason } = payload;
            if (import.meta.env.DEV) {
                console.log('[MCP Bridge UI] Received question rejection:', payload);
            }

            // Check if this is a timeout and we haven't retried yet
            const currentRetries = retryAttempts.get(requestId) ?? 0;
            // NOTE: We disable retry for timeout because the server has already rejected the request.
            // Retrying with the same ID would be futile as the server won't accept answers for a rejected ID.
            // This prevents the wizard from getting stuck with a dead question.
            const shouldRetry = timedOut && currentRetries < 1 && false;

            if (shouldRetry) {
                // Retry once: route to active instance again
                retryAttempts.set(requestId, currentRetries + 1);

                const storedPayload = questionPayloads.get(requestId);
                if (storedPayload) {
                    if (import.meta.env.DEV) {
                        console.log(`[MCP Bridge UI] Retrying timed-out question ${requestId} (attempt ${currentRetries + 1}/1)`);
                    }

                    // Clear from processed set to allow re-processing
                    const mappedInstanceId = requestInstanceMap.get(requestId) ?? instanceId;
                    getProcessedQuestions(mappedInstanceId).delete(requestId);

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
                        // Fallback render confirmation for cases where the wizard mount is delayed
                        if (isElectronEnvironment() && (source || 'mcp') === 'mcp') {
                            setTimeout(() => {
                                const electronAPI = (window as any).electronAPI;
                                electronAPI.mcpSend('mcp:renderConfirmed', {
                                    requestId,
                                    timestamp: Date.now()
                                });
                                if (import.meta.env.DEV) {
                                    console.log(`[MCP Bridge UI] Sent render confirmation fallback for retry ${requestId}`);
                                }
                            }, 100);
                        }

                        // Re-add to processed set
                        getProcessedQuestions(activeId).add(requestId);

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
            const mappedInstanceId = requestInstanceMap.get(requestId) ?? instanceId;
            getProcessedQuestions(mappedInstanceId).delete(requestId);

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

            // Clean up tracking maps to prevent memory leak
            clearProcessedQuestion(requestId);
        });

        // Store cleanup function for this instance (combines both listeners)
        cleanupFunctions.set(instanceId, () => {
            cleanup();
            cleanupRejected();
        });

        if (import.meta.env.DEV) {
            console.log('[MCP Bridge UI] Initialized successfully');
        }
    } catch (error) {
        console.error('[MCP Bridge UI] Failed to initialize:', error);
        initializedInstances.delete(instanceId);
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
 * Reset MCP bridge for true instance removal (allows re-init)
 */
export function resetMcpBridge(instanceId: string): void {
    cleanupMcpBridge(instanceId);
    initializedInstances.delete(instanceId);
    processedQuestionsByInstance.delete(instanceId);
    let hasPending = false;
    for (const [requestId, mappedInstanceId] of requestInstanceMap.entries()) {
        if (mappedInstanceId === instanceId) {
            requestInstanceMap.delete(requestId);
            retryAttempts.delete(requestId);
            questionPayloads.delete(requestId);
            notifiedQuestionRequests.delete(requestId);
            hasPending = true;
        }
    }
    if (hasPending) {
        if (import.meta.env.DEV) {
            console.log(`[MCP Bridge UI] Pending requests cleared for instance: ${instanceId}`);
        }
    }
}

/**
 * Clear processed question from deduplication set (call after answer/cancel)
 */
export function clearProcessedQuestion(requestId: string): void {
    const instanceId = requestInstanceMap.get(requestId);
    if (instanceId) {
        getProcessedQuestions(instanceId).delete(requestId);
        requestInstanceMap.delete(requestId);
    }
    notifiedQuestionRequests.delete(requestId);
    retryAttempts.delete(requestId);
    questionPayloads.delete(requestId);
}
