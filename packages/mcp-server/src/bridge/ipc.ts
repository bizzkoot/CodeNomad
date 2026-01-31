import type { BrowserWindow } from 'electron';
import type { QuestionInfo, QuestionAnswer } from '../tools/schemas.js';
import type { QuestionBridge } from '../tools/askUser.js';
import type { PendingRequestManager } from '../pending.js';

type McpLogLevel = 'info' | 'warn' | 'error';

function emitRendererLog(mainWindow: BrowserWindow, level: McpLogLevel, message: string, data?: unknown) {
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return;
    }
    mainWindow.webContents.send('mcp:log', { level, message, data });
}

/**
 * Global reference to the pending manager for IPC handlers
 * This will be set when the bridge is connected
 */
let globalPendingManager: PendingRequestManager | null = null;

/**
 * Setup IPC handlers for MCP bridge in main process
 * This handles communication between the UI (renderer) and the MCP server
 */
export async function setupMcpBridge(mainWindow: BrowserWindow): Promise<void> {
    console.log('[MCP IPC] Setting up main process bridge');
    emitRendererLog(mainWindow, 'info', 'Setting up main process bridge');

    // Attempt to import electron dynamically. If not available (e.g., in test env), skip attaching handlers.
    let ipcMain: any = null
    try {
        const electron = await import('electron')
        ipcMain = electron?.ipcMain
        if (!ipcMain || typeof ipcMain.on !== 'function') {
            console.warn('[MCP IPC] ipcMain not available on electron import, skipping IPC handler setup')
            emitRendererLog(mainWindow, 'warn', 'ipcMain not available on electron import, skipping IPC handler setup')
            return
        }
    } catch (err) {
        console.warn('[MCP IPC] Electron not available, skipping IPC handler setup')
        emitRendererLog(mainWindow, 'warn', 'Electron not available, skipping IPC handler setup')
        return
    }

    // Handler: Debug messages from renderer
    ipcMain.on('mcp:debug', (_event: any, data: any) => {
        const { message, instanceId } = data;
        console.log(`[MCP IPC DEBUG] ${message}${instanceId ? ` (instance: ${instanceId})` : ''}`);
        emitRendererLog(mainWindow, 'info', message, { instanceId });
    });

    // Handler: UI sends answer for MCP question
    ipcMain.on('mcp:answer', (_event: any, data: any) => {
        const { requestId, answers } = data;
        console.log(`[MCP IPC] Received answer from UI: ${requestId}`);
        emitRendererLog(mainWindow, 'info', 'Received answer from UI', { requestId });

        if (globalPendingManager) {
            const resolved = globalPendingManager.resolve(requestId, answers);
            if (resolved) {
                console.log(`[MCP IPC] Request ${requestId} resolved successfully`);
                emitRendererLog(mainWindow, 'info', 'Request resolved successfully', { requestId });
            } else {
                console.warn(`[MCP IPC] No pending request for answer: ${requestId}`);
                emitRendererLog(mainWindow, 'warn', 'No pending request for answer', { requestId });
            }
        } else {
            console.warn('[MCP IPC] Pending manager not initialized, cannot process answer');
            emitRendererLog(mainWindow, 'warn', 'Pending manager not initialized, cannot process answer');
        }
    });

    // Handler: UI sends cancel for MCP question
    ipcMain.on('mcp:cancel', (_event: any, data: any) => {
        const { requestId } = data;
        console.log(`[MCP IPC] Received cancel from UI: ${requestId}`);
        emitRendererLog(mainWindow, 'info', 'Received cancel from UI', { requestId });

        if (globalPendingManager) {
            const rejected = globalPendingManager.reject(requestId, new Error('cancelled'));
            if (rejected) {
                console.log(`[MCP IPC] Request ${requestId} cancelled successfully`);
                emitRendererLog(mainWindow, 'info', 'Request cancelled successfully', { requestId });
                // Notify UI that the question was rejected
                mainWindow.webContents.send('ask_user.rejected', {
                    requestId,
                    reason: 'cancelled',
                    timedOut: false,
                    cancelled: true
                });
            } else {
                console.warn(`[MCP IPC] No pending request for cancel: ${requestId}`);
                emitRendererLog(mainWindow, 'warn', 'No pending request for cancel', { requestId });
            }
        } else {
            console.warn('[MCP IPC] Pending manager not initialized, cannot process cancel');
            emitRendererLog(mainWindow, 'warn', 'Pending manager not initialized, cannot process cancel');
        }
    });

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

    // Cleanup on window close
    mainWindow.on('closed', () => {
        console.log('[MCP IPC] Window closed, cleaning up pending requests');
        emitRendererLog(mainWindow, 'warn', 'Window closed, cleaning up pending requests');
        if (globalPendingManager) {
            for (const request of globalPendingManager.getAll()) {
                // Notify UI before rejecting (UI may still receive if not fully destroyed)
                mainWindow.webContents.send('ask_user.rejected', {
                    requestId: request.id,
                    reason: 'session-stop',
                    timedOut: false,
                    cancelled: false
                });
                globalPendingManager.reject(request.id, new Error('Window closed'));
            }
        }
    });

    console.log('[MCP IPC] Main process bridge setup complete');
    emitRendererLog(mainWindow, 'info', 'Main process bridge setup complete');
}

/**
 * Create a bridge that uses IPC to communicate with the UI
 * Call this after MCP server is initialized to connect it to IPC
 */
export function createIpcBridge(mainWindow: BrowserWindow, pendingManager: PendingRequestManager): QuestionBridge {
    console.log('[MCP IPC] Creating IPC bridge for MCP server');

    return {
        sendQuestion: (requestId: string, questions: Array<QuestionInfo & { id: string }>, title?: string) => {
            console.log(`[MCP IPC] Sending question to UI: ${requestId}`);
            emitRendererLog(mainWindow, 'info', 'Sending question to UI', { requestId, questionCount: questions.length, title: title ?? null });

            if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
                console.warn(`[MCP IPC] Window/webContents destroyed; cannot send question: ${requestId}`);
                emitRendererLog(mainWindow, 'warn', 'Window/webContents destroyed; cannot send question', { requestId });
                pendingManager.reject(requestId, new Error('Window destroyed'));
                return;
            }

            // Send to renderer process
            try {
                mainWindow.webContents.send('ask_user.asked', {
                    requestId,
                    questions,
                    title,
                    source: 'mcp'
                });
            } catch (error) {
                console.error(`[MCP IPC] Failed to send question ${requestId}:`, error);
                emitRendererLog(mainWindow, 'error', 'Failed to send question', { requestId, error });
                pendingManager.reject(requestId, new Error('IPC send failed'));
                return;
            }

            // Create a promise that waits for the answer
            // This will be resolved by the IPC handlers above
            const pending = pendingManager.get(requestId);
            if (pending) {
                // The pending manager already handles the timeout
                // We just need to make sure the promise is set up correctly
                console.log(`[MCP IPC] Question ${requestId} registered in pending manager`);
                emitRendererLog(mainWindow, 'info', 'Question registered in pending manager', { requestId });
            } else {
                console.warn(`[MCP IPC] Question ${requestId} not found in pending manager`);
                emitRendererLog(mainWindow, 'warn', 'Question not found in pending manager', { requestId });
            }
        },
        onAnswer: (callback: (requestId: string, answers: QuestionAnswer[]) => void) => {
            // Already handled via 'mcp:answer' IPC handler in setupMcpBridge
            console.log('[MCP IPC] Answer handler registered (via IPC)');
        },
        onCancel: (callback: (requestId: string) => void) => {
            // Already handled via 'mcp:cancel' IPC handler in setupMcpBridge
            console.log('[MCP IPC] Cancel handler registered (via IPC)');
        },
        onRenderConfirmed: (callback: (requestId: string) => void) => {
            // Handled via 'mcp:renderConfirmed' IPC handler above
            console.log('[MCP IPC] Render confirmation handler registered (via IPC)');
        }
    };
}

/**
 * Connect the MCP server to IPC
 * This creates an IPC bridge and connects it to the server
 */
export function connectMcpBridge(mcpServer: any, mainWindow: BrowserWindow): void {
    console.log('[MCP IPC] Connecting MCP server to IPC bridge');

    // Get the pending manager from the server
    const pendingManager = mcpServer.getPendingManager();

    // Set global reference for IPC handlers
    globalPendingManager = pendingManager;

    // Create the IPC bridge
    const ipcBridge = createIpcBridge(mainWindow, pendingManager);

    // Connect the bridge to the server
    mcpServer.connectBridge(ipcBridge);

    console.log('[MCP IPC] MCP server connected to IPC bridge');
}
